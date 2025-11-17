import { Request, Response, NextFunction } from "express";
import { loadEnv } from "../env";

const env = loadEnv();

const roleByKey: Record<string, "agent" | "lead"> = {
  [env.API_KEY_AGENT]: "agent",
  [env.API_KEY_LEAD]: "lead"
};

export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header("x-api-key") ?? (req.query.apiKey as string | undefined);
  if (!apiKey) {
    return res.status(401).json({ error: "Missing API key" });
  }

  const role = roleByKey[apiKey];
  if (!role) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  req.customerRole = role;
  next();
};

