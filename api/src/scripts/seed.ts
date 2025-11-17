import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { createReadStream } from "fs";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";
import { EntityTarget, ObjectLiteral } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { AppDataSource } from "../data-source";
import { logger } from "../logger";
import { Customer } from "../entities/Customer";
import { Account } from "../entities/Account";
import { Card } from "../entities/Card";
import { Transaction } from "../entities/Transaction";
import { Alert } from "../entities/Alert";
import { KnowledgeBaseDoc } from "../entities/KnowledgeBaseDoc";
import { Policy } from "../entities/Policy";
import { Chargeback } from "../entities/Chargeback";
import { KnownDevice } from "../entities/KnownDevice";

const BATCH_SIZE = 1000;
const defaultFixturesDir = path.resolve(__dirname, "../../fixtures");

const chunked = <T>(items: T[], size = BATCH_SIZE): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const insertChunk = async <T extends ObjectLiteral>(
  entity: EntityTarget<T>,
  rows: QueryDeepPartialEntity<T>[]
) => {
  if (!rows.length) return;
  await AppDataSource.createQueryBuilder().insert().into(entity).values(rows).orIgnore().execute();
};

const readFixture = async <T>(fixturesDir: string, filename: string) => {
  const file = path.join(fixturesDir, filename);
  const contents = await fs.readFile(file, "utf-8");
  return JSON.parse(contents) as T;
};

export const seedDatabase = async (fixturesDir = defaultFixturesDir) => {
  await AppDataSource.initialize();
  logger.info({ fixturesDir }, "Seeding database");

  await AppDataSource.query(
    `TRUNCATE TABLE agent_traces,
      triage_runs,
      case_events,
      cases,
      alerts,
      chargebacks,
      devices,
      transactions,
      cards,
      accounts,
      kb_docs,
      policies,
      customers
    RESTART IDENTITY CASCADE`
  );

  const customers = await readFixture<
    Array<Pick<Customer, "id" | "name" | "emailMasked" | "kycLevel"> & { createdAt: string }>
  >(fixturesDir, "customers.json");
  for (const batch of chunked(
    customers.map((customer) => ({
      ...customer,
      createdAt: new Date(customer.createdAt)
    }))
  )) {
    await insertChunk(Customer, batch);
  }
  logger.info({ count: customers.length }, "Seeded customers");

  const accounts = await readFixture<
    Array<Pick<Account, "id" | "customerId" | "currency"> & { balanceCents: number }>
  >(fixturesDir, "accounts.json");
  for (const batch of chunked(
    accounts.map((account) => ({
      ...account,
      balanceCents: String(account.balanceCents)
    }))
  )) {
    await insertChunk(Account, batch);
  }
  logger.info({ count: accounts.length }, "Seeded accounts");

  const cards = await readFixture<
    Array<Pick<Card, "id" | "customerId" | "last4" | "network" | "status"> & { createdAt: string }>
  >(fixturesDir, "cards.json");
  for (const batch of chunked(
    cards.map((card) => ({
      ...card,
      createdAt: new Date(card.createdAt)
    }))
  )) {
    await insertChunk(Card, batch);
  }
  logger.info({ count: cards.length }, "Seeded cards");

  const kbDocs = await readFixture<KnowledgeBaseDoc[]>(fixturesDir, "kb_docs.json");
  for (const batch of chunked(kbDocs, 500)) {
    await insertChunk(KnowledgeBaseDoc, batch);
  }
  logger.info({ count: kbDocs.length }, "Seeded KB docs");

  const policies = await readFixture<Policy[]>(fixturesDir, "policies.json");
  for (const batch of chunked(policies, 200)) {
    await insertChunk(Policy, batch);
  }
  logger.info({ count: policies.length }, "Seeded policies");

  const chargebacks = await readFixture<
    Array<Pick<Chargeback, "customerId" | "transactionId" | "status"> & { openedAt: string }>
  >(fixturesDir, "chargebacks.json");
  for (const batch of chunked(
    chargebacks.map((cb) => ({
      ...cb,
      openedAt: new Date(cb.openedAt)
    })),
    500
  )) {
    await insertChunk(Chargeback, batch);
  }
  logger.info({ count: chargebacks.length }, "Seeded chargebacks");

  const devices = await readFixture<
    Array<Pick<KnownDevice, "customerId" | "deviceId"> & { lastSeen: string }>
  >(fixturesDir, "devices.json");
  for (const batch of chunked(
    devices.map((device) => ({
      ...device,
      lastSeen: new Date(device.lastSeen)
    })),
    1000
  )) {
    await insertChunk(KnownDevice, batch);
  }
  logger.info({ count: devices.length }, "Seeded known devices");

  const transactionsFile = path.join(fixturesDir, "transactions.json");
  let txnCount = 0;
  const transactionStream = createReadStream(transactionsFile).pipe(parser()).pipe(streamArray());
  let txnBatch: QueryDeepPartialEntity<Transaction>[] = [];
  for await (const chunk of transactionStream) {
    const value = chunk.value as Record<string, string>;
    txnBatch.push({
      id: value.id,
      txnId: value.txnId,
      customerId: value.customerId,
      cardId: value.cardId,
      mcc: value.mcc,
      merchant: value.merchant,
      amountCents: String(value.amountCents),
      currency: value.currency,
      timestamp: new Date(value.ts ?? value.timestamp),
      deviceId: value.deviceId,
      country: value.country,
      city: value.city
    });
    if (txnBatch.length >= BATCH_SIZE) {
      await insertChunk(Transaction, txnBatch);
      txnCount += txnBatch.length;
      txnBatch = [];
    }
  }
  if (txnBatch.length) {
    await insertChunk(Transaction, txnBatch);
    txnCount += txnBatch.length;
  }
  logger.info({ count: txnCount }, "Seeded transactions");

  const alerts = await readFixture<
    Array<
      Pick<Alert, "id" | "customerId" | "suspectTransactionId" | "risk" | "status"> & {
        createdAt: string;
      }
    >
  >(fixturesDir, "alerts.json");
  for (const batch of chunked(
    alerts.map((alert) => ({
      ...alert,
      createdAt: new Date(alert.createdAt)
    })),
    500
  )) {
    await insertChunk(Alert, batch);
  }
  logger.info({ count: alerts.length }, "Seeded alerts");

  await AppDataSource.destroy();
};

if (require.main === module) {
  seedDatabase().catch((err) => {
    logger.error({ err }, "Failed to seed database");
    process.exit(1);
  });
}

