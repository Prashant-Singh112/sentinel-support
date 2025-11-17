import Redis from "ioredis";
import { loadEnv } from "./env";

const env = loadEnv();

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3
});

redis.on("error", (err) => {
  console.error("Redis error", err);
});

