import { Request, Response, NextFunction } from "express";
import { redis } from "../redis";
import { loadEnv } from "../env";
import { metrics } from "../observability/metrics";
import { logger } from "../logger";

const env = loadEnv();

export const rateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const clientId =
    req.sessionId ??
    (typeof req.query.sessionId === "string" ? req.query.sessionId : undefined) ??
    req.ip ??
    req.header("x-forwarded-for") ??
    "anonymous";

  const nowWindow = Math.floor(Date.now() / 1000);
  const key = `rl:${clientId}:${nowWindow}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 1);
    }

    if (count > env.RATE_LIMIT_RPS) {
      metrics.rateLimitBlocks.inc();
      logger.warn({
        ts: new Date().toISOString(),
        event: "rate_limit_block",
        clientId,
        requestId: req.requestId,
        masked: true
      });
      res.setHeader("Retry-After", "1");
      return res.status(429).json({ error: "Rate limit exceeded" });
    }
  } catch (error) {
    // Fail open on rate-limit errors
    console.error("Rate limiter error", error);
  }

  return next();
};

