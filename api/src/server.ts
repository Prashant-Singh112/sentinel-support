import "dotenv/config";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { logger } from "./logger";

const env = loadEnv();

const bootstrap = async () => {
  const app = await createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "API listening");
  });
};

bootstrap().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});

