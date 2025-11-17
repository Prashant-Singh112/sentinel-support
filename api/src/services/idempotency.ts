import { redis } from "../redis";

const IDEMP_PREFIX = "idem:";
const TTL_SECONDS = 60 * 5;

export const getIdempotentResponse = async <T>(key: string): Promise<T | null> => {
  const cached = await redis.get(IDEMP_PREFIX + key);
  return cached ? (JSON.parse(cached) as T) : null;
};

export const setIdempotentResponse = async <T>(key: string, value: T) => {
  await redis.set(IDEMP_PREFIX + key, JSON.stringify(value), "EX", TTL_SECONDS);
};

