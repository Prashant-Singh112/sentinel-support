import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export const requestContext = (req: Request, _res: Response, next: NextFunction) => {
  const headerRequestId = req.header("x-request-id");
  req.requestId = headerRequestId ?? randomUUID();
  req.sessionId = req.header("x-session-id") ?? randomUUID();
  next();
};

