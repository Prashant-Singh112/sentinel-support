import { Request, Response, NextFunction } from "express";
import { performance } from "perf_hooks";
import { metrics } from "../observability/metrics";

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();
  res.on("finish", () => {
    const duration = performance.now() - start;
    metrics.apiLatency.observe(
      {
        route: req.route?.path ?? req.path,
        method: req.method,
        status: res.statusCode
      },
      duration
    );
  });
  next();
};

