import { redis } from "../redis";
import { AppDataSource } from "../data-source";
import { CaseEvent } from "../entities/CaseEvent";
import { logger } from "../logger";
import { redactObject } from "../utils/redact";

export interface CaseEventJob {
  caseId: string;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  requestId?: string;
  sessionId?: string;
}

const QUEUE_NAME = "case-events";
let workerStarted = false;

export const enqueueCaseEvent = async (job: CaseEventJob) => {
  await redis.lpush(QUEUE_NAME, JSON.stringify(job));
};

export const startCaseEventWorker = () => {
  if (process.env.DISABLE_CASE_EVENT_WORKER === "true") {
    workerStarted = true;
    return;
  }
  if (workerStarted) {
    return;
  }
  workerStarted = true;
  const worker = redis.duplicate();
  worker.on("error", (err) => {
    logger.error({ err, event: "case_event_worker_error" });
  });

  const processLoop = async () => {
    while (true) {
      try {
        const result = await worker.brpop(QUEUE_NAME, 0);
        if (!result) {
          continue;
        }
        const [, payloadRaw] = result;
        const job = JSON.parse(payloadRaw) as CaseEventJob;
        const repo = AppDataSource.getRepository(CaseEvent);
        await repo.save(
          repo.create({
            caseId: job.caseId,
            actor: job.actor,
            action: job.action,
            payloadJson: redactObject(job.payload)
          })
        );
        logger.info({
          ts: new Date().toISOString(),
          event: "case_event_appended",
          caseId: job.caseId,
          requestId: job.requestId,
          sessionId: job.sessionId,
          masked: true
        });
      } catch (err) {
        logger.error({ err, event: "case_event_worker_failure" });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  processLoop().catch((err) => {
    logger.error({ err, event: "case_event_worker_crashed" });
  });
};

