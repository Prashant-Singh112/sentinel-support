import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { AppDataSource } from "./data-source";
import { loadEnv } from "./env";
import { logger } from "./logger";
import { metrics } from "./observability/metrics";
import { requestContext } from "./middleware/requestContext";
import { metricsMiddleware } from "./middleware/metrics";
import { auditMiddleware } from "./middleware/audit";
import ingestRouter from "./routes/ingest";
import customerRouter from "./routes/customer";
import insightsRouter from "./routes/insights";
import triageRouter from "./routes/triage";
import actionRouter from "./routes/actions";
import kbRouter from "./routes/kb";
import alertsRouter from "./routes/alerts";
import dashboardRouter from "./routes/dashboard";
import { startCaseEventWorker } from "./jobs/caseEventWorker";

const env = loadEnv();
let appInitialized = false;

export const createApp = async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  if (!appInitialized) {
    startCaseEventWorker();
    appInitialized = true;
  }

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          styleSrc: ["'self'"]
        }
      }
    })
  );
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(requestContext);
  app.use(metricsMiddleware);
  app.use(auditMiddleware);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "api", version: env.NODE_ENV });
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  app.use("/api/ingest/transactions", ingestRouter);
  app.use("/api/customer", customerRouter);
  app.use("/api/insights", insightsRouter);
  app.use("/api/triage", triageRouter);
  app.use("/api/action", actionRouter);
  app.use("/api/kb", kbRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error({ err, requestId: _req.requestId }, "Unhandled error");
      res.status(500).json({ error: "Internal Server Error" });
    }
  );

  return app;
};

