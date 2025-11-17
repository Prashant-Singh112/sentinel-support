import { performance } from "perf_hooks";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Alert } from "../entities/Alert";
import { Customer } from "../entities/Customer";
import { Transaction } from "../entities/Transaction";
import { KnowledgeBaseDoc } from "../entities/KnowledgeBaseDoc";
import { TriageRun } from "../entities/TriageRun";
import { AgentTrace } from "../entities/AgentTrace";
import { Chargeback } from "../entities/Chargeback";
import { KnownDevice } from "../entities/KnownDevice";
import { Policy } from "../entities/Policy";
import { metrics } from "../observability/metrics";
import { logger } from "../logger";
import { redactObject } from "../utils/redact";
import { TriageEvent, TriageRunState } from "./types";

type Listener = (event: TriageEvent) => void;

class TriageStore {
  private runs = new Map<string, TriageRunState>();
  private listeners = new Map<string, Set<Listener>>();

  create(runId: string, alertId: string, customerId: string): TriageRunState {
    const state: TriageRunState = {
      runId,
      alertId,
      customerId,
      events: [],
      completed: false,
      fallbackUsed: false
    };
    this.runs.set(runId, state);
    return state;
  }

  get(runId: string) {
    return this.runs.get(runId);
  }

  append(runId: string, event: TriageEvent) {
    const state = this.runs.get(runId);
    if (!state) {
      return;
    }
    const sanitized = redactObject(event) as TriageEvent;
    state.events.push(sanitized);
    if (sanitized.type === "fallback_triggered") {
      state.fallbackUsed = true;
    }
    if (sanitized.type === "decision_finalized") {
      state.completed = true;
    }
    this.listeners.get(runId)?.forEach((listener) => listener(sanitized));
  }

  subscribe(runId: string, listener: Listener) {
    const existing = this.listeners.get(runId) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(runId, existing);
    return () => {
      existing.delete(listener);
    };
  }
}

export const triageStore = new TriageStore();

export type ToolName =
  | "getProfile"
  | "recentTx"
  | "riskSignals"
  | "kbLookup"
  | "decide"
  | "proposeAction";

const defaultPlan: ToolName[] = [
  "getProfile",
  "recentTx",
  "riskSignals",
  "kbLookup",
  "decide",
  "proposeAction"
];

interface RunOptions {
  simulateFailures?: ToolName[];
}

interface TriageContext {
  alert: Alert;
  customer: Customer;
  transactions: Transaction[];
  kbDocs: KnowledgeBaseDoc[];
  devices: KnownDevice[];
  chargebacks: Chargeback[];
  policies: Policy[];
  scratch: Record<string, unknown>;
  options?: RunOptions;
}

const toolTimeoutMs = 1000;
const retrySchedule = [150, 400];
const flowBudgetMs = 5000;

const ONE_HOUR_MS = 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 2 * 60 * 60 * 1000;

interface DuplicatePairInfo {
  merchant: string;
  amountCents: string;
  firstTs: Date;
  secondTs: Date;
}

interface RiskFlags {
  travelFlag: boolean;
  duplicatePair?: DuplicatePairInfo;
  abcDispute: boolean;
  deviceChange: boolean;
  chargebackHistory: boolean;
}

const circuitState = new Map<ToolName, { failures: number; openedAt?: number }>();

const toolSchemas: Partial<Record<ToolName, z.ZodTypeAny>> = {
  getProfile: z.object({
    kycLevel: z.string(),
    email: z.string(),
    createdAt: z.date()
  }),
  recentTx: z.array(z.any()),
  riskSignals: z.object({
    score: z.number(),
    risk: z.enum(["low", "medium", "high"]),
    reasons: z.array(z.string())
  }),
  kbLookup: z.object({
    docId: z.string().nullable(),
    title: z.string().optional(),
    anchor: z.string().optional()
  }),
  decide: z.object({
    recommendation: z.string(),
    risk: z.enum(["low", "medium", "high"])
  }),
  proposeAction: z.enum(["freeze-card", "contact-customer", "mark-false-positive", "open-dispute"])
};

const formatAmount = (amountCents: string, currency: string) => {
  const amount = Number(amountCents) / 100;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency
  }).format(amount);
};

const detectDuplicatePair = (transactions: Transaction[]): DuplicatePairInfo | null => {
  const scoped = transactions.slice(0, 25);
  for (let i = 0; i < scoped.length; i += 1) {
    const primary = scoped[i];
    for (let j = i + 1; j < scoped.length; j += 1) {
      const secondary = scoped[j];
      if (
        primary.merchant === secondary.merchant &&
        primary.amountCents === secondary.amountCents &&
        Math.abs(primary.timestamp.getTime() - secondary.timestamp.getTime()) <= DUPLICATE_WINDOW_MS
      ) {
        return primary.timestamp <= secondary.timestamp
          ? {
              merchant: primary.merchant,
              amountCents: primary.amountCents,
              firstTs: primary.timestamp,
              secondTs: secondary.timestamp
            }
          : {
              merchant: primary.merchant,
              amountCents: primary.amountCents,
              firstTs: secondary.timestamp,
              secondTs: primary.timestamp
            };
      }
    }
  }
  return null;
};

const hasTravelPattern = (transactions: Transaction[]) => {
  const countries = new Set(transactions.slice(0, 25).map((txn) => txn.country));
  return countries.size > 1;
};

const getSuspectTransaction = (ctx: TriageContext) =>
  ctx.alert.suspectTransaction ?? ctx.transactions[0];

const executeWithPolicies = async (
  tool: ToolName,
  handler: (ctx: TriageContext) => Promise<unknown>,
  ctx: TriageContext,
  emit: (event: TriageEvent) => void
) => {
  const circuit = circuitState.get(tool);
  if (circuit?.openedAt && Date.now() - circuit.openedAt < 30_000) {
    emit({ type: "fallback_triggered", reason: `${tool}_circuit_open` });
    metrics.agentFallbackTotal.inc({ tool });
    return null;
  }

  let attempt = 0;
  const runAttempt = async (): Promise<unknown> => {
    attempt += 1;
    const start = performance.now();
    try {
      if (ctx.options?.simulateFailures?.includes(tool)) {
        throw new Error("simulated_failure");
      }
      const result = await Promise.race([
        handler(ctx),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("timeout")), toolTimeoutMs)
        )
      ]);
      const schema = toolSchemas[tool];
      if (schema) {
        const parsed = schema.safeParse(result);
        if (!parsed.success) {
          throw new Error("schema_validation_failed");
        }
      }
      const duration = performance.now() - start;
      metrics.toolCallTotal.inc({ tool, ok: "true" });
      emit({
        type: "tool_update",
        tool,
        ok: true,
        detail: `ok (attempt ${attempt})`,
        durationMs: Math.round(duration)
      });
      circuitState.set(tool, { failures: 0 });
      return result;
    } catch (error) {
      metrics.toolCallTotal.inc({ tool, ok: "false" });
      emit({
        type: "tool_update",
        tool,
        ok: false,
        detail: (error as Error).message,
        durationMs: Math.round(performance.now() - start)
      });
      const failures = (circuit?.failures ?? 0) + 1;
      if (failures >= 3) {
        circuitState.set(tool, { failures, openedAt: Date.now() });
      } else {
        circuitState.set(tool, { failures });
      }
      if (attempt <= retrySchedule.length) {
        const backoff = retrySchedule[attempt - 1] + Math.floor(Math.random() * 50);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return runAttempt();
      }
      const fallbackReason = tool === "riskSignals" ? "risk_unavailable" : `${tool}_failed`;
      emit({ type: "fallback_triggered", reason: fallbackReason });
      metrics.agentFallbackTotal.inc({ tool });
      return null;
    }
  };

  return runAttempt();
};

const toolHandlers: Record<ToolName, (ctx: TriageContext) => Promise<unknown>> = {
  async getProfile(ctx) {
    ctx.scratch.profile = {
      kycLevel: ctx.customer.kycLevel,
      email: ctx.customer.emailMasked,
      createdAt: ctx.customer.createdAt
    };
    return ctx.scratch.profile;
  },
  async recentTx(ctx) {
    ctx.scratch.recent = ctx.transactions.slice(0, 10);
    return ctx.scratch.recent;
  },
  async riskSignals(ctx) {
    const suspect = getSuspectTransaction(ctx);
    if (!suspect) {
      ctx.scratch.risk = { score: 40, risk: "low", reasons: ["Insufficient transaction history"] };
      return ctx.scratch.risk;
    }

    const duplicatePair = detectDuplicatePair(ctx.transactions);
    const travelFlag = hasTravelPattern(ctx.transactions);
    const deviceChange = ctx.devices.every((device) => device.deviceId !== suspect.deviceId);
    const chargebackHistory = ctx.chargebacks.length > 0;
    const abcDispute =
      suspect.merchant.toLowerCase().includes("abc") &&
      Number(suspect.amountCents) >= 400_000 &&
      Number(suspect.amountCents) <= 600_000;

    const highAmount = Number(suspect.amountCents) >= 500_000;
    const crossBorder = suspect.country !== "IN";
    const velocityCount = ctx.transactions.filter(
      (txn) => Math.abs(suspect.timestamp.getTime() - txn.timestamp.getTime()) <= ONE_HOUR_MS
    ).length;
    const velocitySpike = velocityCount >= 4;

    let score = 40;
    const reasons: string[] = [];

    if (highAmount) {
      score += 20;
      reasons.push(`High amount ${formatAmount(suspect.amountCents, suspect.currency)}`);
    }

    if (crossBorder) {
      score += 15;
      reasons.push("Cross-border spend detected");
    }

    if (velocitySpike) {
      score += 10;
      reasons.push("Velocity spike (>3 txns in 1h)");
    }

    if (deviceChange) {
      score += 15;
      reasons.push("New device observed");
    } else {
      reasons.push("Known device fingerprint");
    }

    if (chargebackHistory) {
      score += 5;
      reasons.push("Chargeback history noted");
    }

    if (abcDispute) {
      score += 5;
      reasons.push("Merchant ABC Mart flagged for dispute workflows");
    }

    if (duplicatePair) {
      score -= 25;
      reasons.push(`Duplicate auth/capture at ${duplicatePair.merchant}`);
    }

    if (travelFlag) {
      reasons.push("Customer travel window detected");
    }

    score = Math.max(5, Math.min(score, 95));
    const risk = score >= 75 ? "high" : score >= 55 ? "medium" : "low";

    ctx.scratch.flags = {
      travelFlag,
      duplicatePair: duplicatePair ?? undefined,
      abcDispute,
      deviceChange,
      chargebackHistory
    } as RiskFlags;

    ctx.scratch.risk = { score, risk, reasons };
    return ctx.scratch.risk;
  },
  async kbLookup(ctx) {
    const flags = ctx.scratch.flags as RiskFlags | undefined;
    const preferredAnchor = flags?.abcDispute
      ? "disputes-10-4"
      : flags?.travelFlag
        ? "kb-travel-window"
        : flags?.duplicatePair
          ? "kb-duplicate-cab"
          : "kb-otp-policy";
    const doc =
      ctx.kbDocs.find((entry) => entry.anchor === preferredAnchor) ??
      ctx.kbDocs[0] ??
      null;
    ctx.scratch.kb = doc
      ? { docId: doc.id, title: doc.title, anchor: doc.anchor }
      : { docId: null };
    if (doc?.anchor) {
      ctx.scratch.kbAnchor = doc.anchor;
    }
    return ctx.scratch.kb;
  },
  async decide(ctx) {
    const risk = ctx.scratch.risk as { risk: "low" | "medium" | "high"; score: number };
    const flags = (ctx.scratch.flags as RiskFlags | undefined) ?? {
      travelFlag: false,
      abcDispute: false,
      deviceChange: false,
      chargebackHistory: false
    };

    let recommendation: "Freeze Card" | "Contact Customer" | "Monitor" | "Open Dispute" | "Mark False Positive" =
      "Contact Customer";
    let normalizedRisk = risk?.risk ?? "low";

    if (flags.abcDispute) {
      recommendation = "Open Dispute";
      if (normalizedRisk === "low") {
        normalizedRisk = "medium";
      }
    } else if (risk?.risk === "high" || (flags.deviceChange && risk?.risk === "medium")) {
      recommendation = "Freeze Card";
    } else if (flags.duplicatePair) {
      recommendation = "Mark False Positive";
      normalizedRisk = "low";
    } else if (normalizedRisk === "low") {
      recommendation = "Monitor";
    }

    ctx.scratch.decision = { recommendation, risk: normalizedRisk };
    return ctx.scratch.decision;
  },
  async proposeAction(ctx) {
    const decision = ctx.scratch.decision as { recommendation: string; risk: string };
    const flags = ctx.scratch.flags as RiskFlags | undefined;

    let action: "freeze-card" | "contact-customer" | "mark-false-positive" | "open-dispute" = "contact-customer";
    switch (decision?.recommendation) {
      case "Freeze Card":
        action = "freeze-card";
        break;
      case "Open Dispute":
        action = "open-dispute";
        break;
      case "Mark False Positive":
        action = "mark-false-positive";
        break;
      case "Monitor":
        action = "contact-customer";
        break;
      default:
        action = "contact-customer";
    }

    if (flags?.abcDispute) {
      ctx.scratch.actionMetadata = { reasonCode: "10.4" };
      ctx.scratch.note = "Reason code 10.4 recommended per ABC Mart policy.";
    } else if (flags?.duplicatePair && flags.duplicatePair) {
      const windowMins = Math.round(
        (flags.duplicatePair.secondTs.getTime() - flags.duplicatePair.firstTs.getTime()) / 60000
      );
      ctx.scratch.note = `Preauth vs capture pair detected at ${flags.duplicatePair.merchant} (${windowMins}m apart)`;
    } else if (flags?.deviceChange) {
      ctx.scratch.note = "New device + elevated amount; require OTP before unfreezing.";
    }

    ctx.scratch.action = action;
    return action;
  }
};

export const runTriage = async (params: {
  alertId: string;
  customerId?: string;
  simulateFailures?: ToolName[];
}) => {
  const alert = await AppDataSource.getRepository(Alert).findOne({
    where: { id: params.alertId },
    relations: ["customer", "suspectTransaction"]
  });
  if (!alert) {
    throw new Error("Alert not found");
  }

  if (params.customerId && params.customerId !== alert.customerId) {
    throw new Error("Alert/customer mismatch");
  }

  const runRepo = AppDataSource.getRepository(TriageRun);
  const traceRepo = AppDataSource.getRepository(AgentTrace);

  const runRecord = await runRepo.save(
    runRepo.create({
      alertId: alert.id,
      risk: "pending",
      reasons: [],
      fallbackUsed: false
    })
  );

  const state = triageStore.create(runRecord.id, alert.id, alert.customerId);

  let seq = 0;
  const persistTrace = (event: TriageEvent) => {
    const step =
      event.type === "tool_update"
        ? event.tool
        : event.type === "fallback_triggered"
          ? "fallback"
          : event.type;
    const ok = event.type === "tool_update" ? event.ok : event.type !== "fallback_triggered";
    const durationMs = event.type === "tool_update" ? event.durationMs : 0;
    seq += 1;
    traceRepo
      .save(
        traceRepo.create({
          runId: runRecord.id,
          seq,
          step,
          ok,
          durationMs,
          detailJson: redactObject(event)
        })
      )
      .catch((err) => logger.error({ err, runId: runRecord.id }, "Failed to persist trace"));
  };

  const emit = (event: TriageEvent) => {
    triageStore.append(runRecord.id, event);
    persistTrace(event);
  };

  const [transactions, kbDocs, devices, chargebacks, policies] = await Promise.all([
    AppDataSource.getRepository(Transaction)
      .createQueryBuilder("txn")
      .where("txn.customer_id = :customerId", { customerId: alert.customerId })
      .orderBy("txn.ts", "DESC")
      .limit(50)
      .getMany(),
    AppDataSource.getRepository(KnowledgeBaseDoc).find(),
    AppDataSource.getRepository(KnownDevice).find({ where: { customerId: alert.customerId } }),
    AppDataSource.getRepository(Chargeback).find({ where: { customerId: alert.customerId } }),
    AppDataSource.getRepository(Policy).find()
  ]);

  const ctx: TriageContext = {
    alert,
    customer: alert.customer as Customer,
    transactions,
    kbDocs,
    devices,
    chargebacks,
    policies,
    scratch: {},
    options: {
      simulateFailures: params.simulateFailures
    }
  };

  const startedAt = performance.now();
  emit({ type: "plan_built", plan: defaultPlan });

  for (const tool of defaultPlan) {
    await executeWithPolicies(tool, toolHandlers[tool], ctx, emit);
    if (performance.now() - startedAt > flowBudgetMs) {
      emit({ type: "fallback_triggered", reason: "flow_budget_exceeded" });
      break;
    }
  }

  const decision = ctx.scratch.decision as { recommendation: string; risk: "low" | "medium" | "high" };
  const action = ctx.scratch.action as
    | "freeze-card"
    | "contact-customer"
    | "mark-false-positive"
    | "open-dispute"
    | undefined;

  const reasons = (ctx.scratch.risk as { reasons?: string[] })?.reasons ?? ["automated summary"];
  const actionMeta = ctx.scratch.actionMetadata as { reasonCode?: string } | undefined;
  const note = typeof ctx.scratch.note === "string" ? ctx.scratch.note : undefined;
  const kbAnchor = typeof ctx.scratch.kbAnchor === "string" ? ctx.scratch.kbAnchor : undefined;
  const reasonBundle = [...reasons];
  if (actionMeta?.reasonCode) {
    reasonBundle.push(`reason_code:${actionMeta.reasonCode}`);
  }
  if (note) {
    reasonBundle.push(note);
  }
  if (kbAnchor) {
    reasonBundle.push(`kb:${kbAnchor}`);
  }

  const derivedRisk = decision?.risk ?? "low";
  const finalRisk = state.fallbackUsed && derivedRisk === "high" ? "medium" : derivedRisk;

  const finalEvent: TriageEvent = {
    type: "decision_finalized",
    recommendation: decision?.recommendation ?? "Monitor",
    risk: finalRisk,
    reasons: reasonBundle,
    action
  };

  emit(finalEvent);

  const totalDuration = performance.now() - startedAt;
  metrics.agentLatency.observe(totalDuration);

  await runRepo.update(runRecord.id, {
    risk: finalRisk,
    reasons: reasonBundle,
    fallbackUsed: state.fallbackUsed,
    latencyMs: Math.round(totalDuration)
  });

  logger.info({
    event: "decision_finalized",
    runId: state.runId,
    alertId: params.alertId,
    risk: finalRisk,
    detail: redactObject(ctx.scratch)
  });

  return { runId: runRecord.id, alertId: alert.id };
};

