import "reflect-metadata";
import { DataSource } from "typeorm";
import { loadEnv } from "./env";
import { Customer } from "./entities/Customer";
import { Card } from "./entities/Card";
import { Account } from "./entities/Account";
import { Transaction } from "./entities/Transaction";
import { Alert } from "./entities/Alert";
import { Case } from "./entities/Case";
import { CaseEvent } from "./entities/CaseEvent";
import { TriageRun } from "./entities/TriageRun";
import { AgentTrace } from "./entities/AgentTrace";
import { KnowledgeBaseDoc } from "./entities/KnowledgeBaseDoc";
import { Policy } from "./entities/Policy";
import { Chargeback } from "./entities/Chargeback";
import { KnownDevice } from "./entities/KnownDevice";

const env = loadEnv();

export const AppDataSource = new DataSource({
  type: "postgres",
  url: env.DATABASE_URL,
  entities: [
    Customer,
    Card,
    Account,
    Transaction,
    Alert,
    Case,
    CaseEvent,
    TriageRun,
    AgentTrace,
    KnowledgeBaseDoc,
    Policy,
    Chargeback,
    KnownDevice
  ],
  migrations: [process.env.NODE_ENV === "production" ? "dist/migrations/*.js" : "src/migrations/*.ts"],
  synchronize: false,
  logging: false
});

