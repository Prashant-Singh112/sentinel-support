import "dotenv/config";
import { AppDataSource } from "../data-source";
import { logger } from "../logger";

const run = async () => {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
  logger.info({ event: "migrations_completed" }, "Database migrations applied");
};

run().catch((err) => {
  logger.error({ err }, "Failed to run migrations");
  process.exit(1);
});

