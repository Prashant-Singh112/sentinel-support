import "dotenv/config";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import supertest from "supertest";
import { createApp } from "../app";
import { loadEnv } from "../env";
import { triageStore } from "../triage/orchestrator";
import { TriageEvent } from "../triage/types";
import { AppDataSource } from "../data-source";
import { Alert } from "../entities/Alert";
import { Transaction } from "../entities/Transaction";
import { CaseEvent } from "../entities/CaseEvent";
import { TriageRun } from "../entities/TriageRun";
import { metrics } from "../observability/metrics";

type RiskLevel = "low" | "medium" | "high";

interface EvalSpec {
  id: string;
  description: string;
  alertId: string;
  simulateFailures?: string[];
  expected: {
    action?: "freeze-card" | "open-dispute" | "contact-customer" | "mark-false-positive";
    reasonCode?: string;
    fallbackUsed?: boolean;
    maxRisk?: RiskLevel;
    kbAnchor?: string;
    mention?: string;
    otpRequired?: boolean;
    status?: number;
    metric?: string;
    policy?: string;
    redaction?: boolean;
  };
}

interface ScenarioOutcome {
  spec: EvalSpec;
  passed: boolean;
  message: string;
  predictedRisk?: RiskLevel;
  actualRisk?: RiskLevel;
  latencyMs?: number;
  fallbackTools: string[];
  policyHits: string[];
}

const waitForRun = async (runId: string, timeoutMs = 8000) => {
  const started = Date.now();
  /* eslint-disable no-await-in-loop */
  while (Date.now() - started < timeoutMs) {
    const state = triageStore.get(runId);
    if (state?.completed) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for triage run ${runId}`);
};

const parseFallbackTool = (reason: string) => {
  if (!reason) return "unknown";
  if (reason === "risk_unavailable") return "riskSignals";
  if (reason === "flow_budget_exceeded") return "planner";
  return reason.split("_")[0];
};

const percentile = (values: number[], pct: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return sorted[idx];
};

const deriveActualRisk = (spec: EvalSpec): RiskLevel => {
  if (spec.expected.maxRisk) {
    return spec.expected.maxRisk;
  }
  switch (spec.expected.action) {
    case "freeze-card":
    case "open-dispute":
      return "high";
    case "contact-customer":
      return "medium";
    case "mark-false-positive":
      return "low";
    default:
      if (spec.expected.kbAnchor === "kb-travel-window" || spec.expected.mention === "duplicate") {
        return "low";
      }
      return "medium";
  }
};

const getCounterValue = async (policy: string) => {
  const snapshot = await metrics.actionBlockedTotal.get();
  const match = snapshot.values.find((entry) => entry.labels.policy === policy);
  return match ? match.value : 0;
};

const fetchAlertContext = async (alertId: string) => {
  const alertRepo = AppDataSource.getRepository(Alert);
  const txnRepo = AppDataSource.getRepository(Transaction);
  const caseEventRepo = AppDataSource.getRepository(CaseEvent);
  const alert = await alertRepo.findOne({ where: { id: alertId } });
  if (!alert) {
    throw new Error(`Alert ${alertId} not found`);
  }
  const suspectTxn = alert.suspectTransactionId
    ? await txnRepo.findOne({ where: { id: alert.suspectTransactionId } })
    : null;
  return { alert, suspectTxn, caseEventRepo };
};

const ensureCaseEventRedaction = async (caseId: string, expectedMasked: string) => {
  const event = await AppDataSource.getRepository(CaseEvent).findOne({
    where: { caseId },
    order: { timestamp: "DESC" }
  });
  if (!event) {
    throw new Error("No case event recorded");
  }
  const message = (event.payloadJson as { message?: string })?.message ?? "";
  if (!message.includes(expectedMasked) || /\d{13,19}/.test(message)) {
    throw new Error("PII redaction check failed");
  }
};

type HttpAgent = supertest.SuperAgentTest;

const runScenario = async (
  spec: EvalSpec,
  agent: HttpAgent,
  apiKey: string
): Promise<ScenarioOutcome> => {
  const outcome: ScenarioOutcome = {
    spec,
    passed: false,
    message: "",
    fallbackTools: [],
    policyHits: []
  };

  if (spec.expected.status === 429) {
    const sessionId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 8 }).map(() =>
        agent
          .post("/api/triage")
          .set("x-api-key", apiKey)
          .set("x-session-id", sessionId)
          .send({ alertId: spec.alertId })
      )
    );
    const had429 = responses.some(
      (res: supertest.Response) => res.status === 429 && Boolean(res.header["retry-after"])
    );
    outcome.passed = had429;
    outcome.message = had429 ? "Rate limit enforced" : "Expected 429 not observed";
    return outcome;
  }

  const sessionId = randomUUID();
  const triagePayload: Record<string, unknown> = { alertId: spec.alertId };
  if (spec.simulateFailures?.length) {
    triagePayload.simulateFailures = spec.simulateFailures;
  }

  const triageResponse = await agent
    .post("/api/triage")
    .set("x-api-key", apiKey)
    .set("x-session-id", sessionId)
    .send(triagePayload);

  if (triageResponse.status !== 202) {
    outcome.message = `Unexpected triage status ${triageResponse.status}`;
    return outcome;
  }

  const { runId } = triageResponse.body as { runId: string };
  const state = await waitForRun(runId);
  const finalEvent = state.events.find((evt) => evt.type === "decision_finalized") as
    | (TriageEvent & { reasons: string[]; action?: string; risk: RiskLevel })
    | undefined;

  const fallbackTools = state.events
    .filter((evt) => evt.type === "fallback_triggered")
    .map((evt) => parseFallbackTool((evt as { reason: string }).reason));
  outcome.fallbackTools = fallbackTools;

  const runRecord = await AppDataSource.getRepository(TriageRun).findOne({ where: { id: runId } });
  outcome.latencyMs = runRecord?.latencyMs ?? undefined;
  outcome.predictedRisk = finalEvent?.risk ?? "low";
  outcome.actualRisk = deriveActualRisk(spec);

  if (!finalEvent) {
    outcome.message = "Missing decision event";
    return outcome;
  }

  const reasonText = finalEvent.reasons?.join(" ").toLowerCase() ?? "";
  let passed = true;
  const messages: string[] = [];

  if (spec.expected.action && finalEvent.action !== spec.expected.action) {
    passed = false;
    messages.push(`Expected action ${spec.expected.action} got ${finalEvent.action}`);
  }

  if (spec.expected.fallbackUsed && !state.fallbackUsed) {
    passed = false;
    messages.push("Expected fallback but none triggered");
  }

  if (spec.expected.maxRisk && outcome.predictedRisk > spec.expected.maxRisk) {
    passed = false;
    messages.push(`Risk ${outcome.predictedRisk} exceeds ${spec.expected.maxRisk}`);
  }

  if (spec.expected.kbAnchor && !reasonText.includes(`kb:${spec.expected.kbAnchor}`)) {
    passed = false;
    messages.push(`Missing citation ${spec.expected.kbAnchor}`);
  }

  if (spec.expected.mention && !reasonText.includes(spec.expected.mention.toLowerCase())) {
    passed = false;
    messages.push(`Missing mention "${spec.expected.mention}"`);
  }

  const { alert, suspectTxn } = await fetchAlertContext(spec.alertId);

    const performFreezeFlow = async (verifyMetric: boolean) => {
    if (!suspectTxn?.cardId) {
      throw new Error("Missing cardId on suspect transaction");
    }
      const baseline =
        verifyMetric && spec.expected.policy ? await getCounterValue(spec.expected.policy) : 0;
    const pendingResponse = await agent
      .post("/api/action/freeze-card")
      .set("x-api-key", apiKey)
      .set("Idempotency-Key", randomUUID())
      .send({ cardId: suspectTxn.cardId, alertId: spec.alertId });
    if (pendingResponse.body.status !== "PENDING_OTP") {
      throw new Error("Freeze action did not request OTP");
    }
    outcome.policyHits.push("otp_required");
    const after =
      verifyMetric && spec.expected.policy ? await getCounterValue(spec.expected.policy) : baseline;
    if (verifyMetric && after <= baseline) {
      throw new Error("Policy metric did not increment");
    }
    const confirmResponse = await agent
      .post("/api/action/freeze-card")
      .set("x-api-key", apiKey)
      .set("Idempotency-Key", randomUUID())
      .send({ cardId: suspectTxn.cardId, alertId: spec.alertId, otp: "123456" });
    if (confirmResponse.body.status !== "FROZEN") {
      throw new Error("Failed to freeze card after OTP");
    }
  };

  const performDispute = async (reasonCode: string) => {
    if (!suspectTxn?.id) throw new Error("No suspect transaction for dispute");
    const response = await agent
      .post("/api/action/open-dispute")
      .set("x-api-key", apiKey)
      .set("Idempotency-Key", randomUUID())
      .send({
        txnId: suspectTxn.id,
        customerId: alert.customerId,
        reasonCode,
        confirm: true
      });
    if (response.body.status !== "OPEN") {
      throw new Error("Dispute not opened");
    }
  };

  const performContact = async (message: string) => {
    const response = await agent
      .post("/api/action/contact-customer")
      .set("x-api-key", apiKey)
      .set("Idempotency-Key", randomUUID())
      .send({
        customerId: alert.customerId,
        channel: "sms",
        message
      });
    if (!response.body.caseId) {
      throw new Error("Contact action missing caseId");
    }
    return response.body.caseId as string;
  };

  try {
    switch (spec.id) {
      case "freeze_otp":
        await performFreezeFlow(false);
        break;
      case "otp_policy_metric":
        await performFreezeFlow(true);
        break;
      case "dispute_abc_mart":
        await performDispute(spec.expected.reasonCode ?? "10.4");
        break;
      case "contact_customer_followup":
        await performContact("Please confirm transaction activity.");
        break;
      case "pii_redaction": {
        const caseId = await performContact("Card 4111111111111111 appears on account");
        await ensureCaseEventRedaction(caseId, "****REDACTED****");
        break;
      }
      default:
        break;
    }
  } catch (err) {
    passed = false;
    messages.push((err as Error).message);
  }

  if (spec.expected.redaction && passed && messages.length === 0) {
    // Additional safety check already handled in switch
    messages.push("Redaction verified");
  }

  outcome.passed = passed;
  outcome.message = messages.length ? messages.join("; ") : "ok";
  return outcome;
};

const main = async () => {
  process.env.DISABLE_CASE_EVENT_WORKER = "true";
  const env = loadEnv();
  const fixturesDir = path.resolve(__dirname, "../../fixtures/evals");
  const files = (await fs.readdir(fixturesDir)).filter((file) => file.endsWith(".json")).sort();
  const specs: EvalSpec[] = await Promise.all(
    files.map(async (file) => JSON.parse(await fs.readFile(path.join(fixturesDir, file), "utf-8")))
  );

  const app = await createApp();
  const agent = supertest.agent(app) as unknown as HttpAgent;

  const results: ScenarioOutcome[] = [];
  const fallbackTotals = new Map<string, number>();
  const policyTotals = new Map<string, number>();
  const latencies: number[] = [];
  const confusion: Record<RiskLevel, Record<RiskLevel, number>> = {
    low: { low: 0, medium: 0, high: 0 },
    medium: { low: 0, medium: 0, high: 0 },
    high: { low: 0, medium: 0, high: 0 }
  };

  for (const spec of specs) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await runScenario(spec, agent, env.API_KEY_AGENT);
    results.push(outcome);
    if (outcome.latencyMs) {
      latencies.push(outcome.latencyMs);
    }
    outcome.fallbackTools.forEach((tool) => {
      fallbackTotals.set(tool, (fallbackTotals.get(tool) ?? 0) + 1);
    });
    outcome.policyHits.forEach((policy) => {
      policyTotals.set(policy, (policyTotals.get(policy) ?? 0) + 1);
    });
    if (outcome.actualRisk && outcome.predictedRisk) {
      confusion[outcome.actualRisk][outcome.predictedRisk] += 1;
    }
  }

  const passed = results.filter((r) => r.passed).length;
  results.forEach((result) => {
    console.log(
      `[${result.passed ? "PASS" : "FAIL"}] ${result.spec.id} - ${result.spec.description} :: ${result.message}`
    );
  });

  console.log("\n=== Eval Summary ===");
  console.log(`Total: ${results.length}, Passed: ${passed}, Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  if (latencies.length) {
    console.log(
      `Agent latency p50=${percentile(latencies, 50)}ms p95=${percentile(latencies, 95)}ms`
    );
  }

  if (fallbackTotals.size) {
    console.log("Fallback rate by tool:");
    fallbackTotals.forEach((count, tool) => {
      console.log(`  ${tool}: ${count} (${((count / results.length) * 100).toFixed(1)}%)`);
    });
  }

  console.log("Risk confusion matrix (actual -> predicted):");
  (["low", "medium", "high"] as RiskLevel[]).forEach((actual) => {
    const row = confusion[actual];
    console.log(
      `  ${actual.padEnd(6)} | low:${row.low} medium:${row.medium} high:${row.high}`
    );
  });

  if (policyTotals.size) {
    console.log("Top policy denials:");
    Array.from(policyTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([policy, count]) => {
        console.log(`  ${policy}: ${count}`);
      });
  }

  await AppDataSource.destroy();
  process.exitCode = passed === results.length ? 0 : 1;
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

