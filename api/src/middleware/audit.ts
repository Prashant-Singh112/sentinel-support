import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";
import { redactObject } from "../utils/redact";

export const audit = (actor: string, action: string, payload: Record<string, unknown>) => {
  logger.info({
    ts: new Date().toISOString(),
    level: "info",
    actor,
    action,
    payload: redactObject(payload),
    masked: true
  });
};

export const auditMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  req.on("end", () => {
    logger.info({
      ts: new Date().toISOString(),
      level: "info",
      event: "api_call",
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      masked: true
    });
  });
  next();
};

