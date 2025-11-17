import { Router, Request, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { requireApiKey } from "../middleware/apiKey";
import { rateLimit } from "../middleware/rateLimit";
import { runTriage, triageStore, ToolName } from "../triage/orchestrator";
import { TriageEvent } from "../triage/types";
import { TriageRun } from "../entities/TriageRun";

const router = Router();

const toolEnum = z.enum(["getProfile", "recentTx", "riskSignals", "kbLookup", "decide", "proposeAction"]);

const triageRequestSchema = z.object({
  alertId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  simulateFailures: z.union([toolEnum, z.array(toolEnum)]).optional()
});

router.post("/", requireApiKey, rateLimit, async (req: Request, res: Response) => {
  const parsed = triageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", detail: parsed.error.flatten() });
  }

  const { alertId, customerId, simulateFailures } = parsed.data;
  const failures: ToolName[] | undefined = !simulateFailures
    ? undefined
    : Array.isArray(simulateFailures)
      ? simulateFailures
      : [simulateFailures];

  const { runId } = await runTriage({
    alertId,
    customerId,
    simulateFailures: failures
  });
  return res.status(202).json({ runId, alertId });
});

router.get("/:runId/stream", requireApiKey, (req: Request, res: Response) => {
  const { runId } = req.params;
  const state = triageStore.get(runId);
  if (!state) {
    return res.status(404).end();
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  const sendEvent = (event: TriageEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  state.events.forEach(sendEvent);

  const unsubscribe = triageStore.subscribe(runId, sendEvent);
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get("/:runId", requireApiKey, async (req: Request, res: Response) => {
  const { runId } = req.params;
  const state = triageStore.get(runId);
  const runRecord = await AppDataSource.getRepository(TriageRun).findOne({
    where: { id: runId }
  });

  if (!state && !runRecord) {
    return res.status(404).json({ error: "Run not found" });
  }

  res.json({
    runId,
    alertId: runRecord?.alertId ?? state?.alertId,
    completed: state?.completed ?? Boolean(runRecord?.endedAt),
    fallbackUsed: state?.fallbackUsed ?? runRecord?.fallbackUsed ?? false,
    latencyMs: runRecord?.latencyMs ?? null,
    risk: runRecord?.risk ?? null,
    reasons: runRecord?.reasons ?? [],
    events: state?.events ?? [],
    endedAt: runRecord?.endedAt,
    startedAt: runRecord?.startedAt
  });
});

export default router;

