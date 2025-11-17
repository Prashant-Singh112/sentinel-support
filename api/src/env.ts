import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5432/sentinel"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  API_KEY_AGENT: z.string().default("agent-key"),
  API_KEY_LEAD: z.string().default("lead-key"),
  RATE_LIMIT_RPS: z.coerce.number().default(5)
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (): Env => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration", parsed.error.format());
    throw new Error("Invalid environment configuration");
  }

  return parsed.data;
};

