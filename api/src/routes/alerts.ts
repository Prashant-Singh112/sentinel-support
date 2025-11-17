import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Alert } from "../entities/Alert";
import { Transaction } from "../entities/Transaction";
import { CaseEvent } from "../entities/CaseEvent";
import { requireApiKey } from "../middleware/apiKey";
import { rateLimit } from "../middleware/rateLimit";
import { encodeCursor, decodeCursor } from "../utils/cursor";

const router = Router();
const alertRepo = () => AppDataSource.getRepository(Alert);

router.get("/", requireApiKey, rateLimit, async (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "25", 10), 100);
  const cursor = req.query.cursor as string | undefined;
  const risk = req.query.risk as string | undefined;
  const status = (req.query.status as string) ?? "OPEN";

  const qb = alertRepo()
    .createQueryBuilder("alert")
    .leftJoinAndSelect("alert.customer", "customer")
    .leftJoinAndSelect("alert.suspectTransaction", "txn")
    .orderBy("alert.created_at", "DESC")
    .addOrderBy("alert.id", "DESC")
    .limit(limit + 1);

  if (status) {
    qb.andWhere("alert.status = :status", { status });
  }

  if (risk) {
    qb.andWhere("alert.risk = :risk", { risk });
  }

  if (cursor) {
    const { ts, id } = decodeCursor(cursor);
    qb.andWhere("(alert.created_at, alert.id) < (:ts, :id)", { ts: new Date(ts), id });
  }

  const rows = await qb.getMany();
  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    risk: row.risk,
    status: row.status,
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      kycLevel: row.customer.kycLevel
    },
    suspectTransaction: row.suspectTransaction
      ? {
          id: row.suspectTransaction.id,
          merchant: row.suspectTransaction.merchant,
          amountCents: row.suspectTransaction.amountCents,
          ts: row.suspectTransaction.timestamp
        }
      : null
  }));

  const nextCursor = hasNext
    ? encodeCursor(
        items[items.length - 1].createdAt.toISOString(),
        items[items.length - 1].id
      )
    : null;

  res.json({ items, nextCursor });
});

router.get("/:id", requireApiKey, async (req, res) => {
  const { id } = req.params;
  const alert = await alertRepo().findOne({
    where: { id },
    relations: ["customer", "suspectTransaction"]
  });
  if (!alert) {
    return res.status(404).json({ error: "Alert not found" });
  }

  const transactions = await AppDataSource.getRepository(Transaction)
    .createQueryBuilder("txn")
    .where("txn.customer_id = :customerId", { customerId: alert.customerId })
    .orderBy("txn.ts", "DESC")
    .limit(50)
    .getMany();

  const caseEvents = await AppDataSource.getRepository(CaseEvent)
    .createQueryBuilder("event")
    .where("event.payload_json ->> 'alertId' = :alertId OR event.action IN (:...actions)", {
      alertId: alert.id,
      actions: ["open_dispute", "freeze_card", "contact_customer"]
    })
    .orderBy("event.ts", "DESC")
    .limit(20)
    .getMany();

  res.json({
    alert,
    customer: alert.customer,
    suspectTransaction: alert.suspectTransaction,
    recentTransactions: transactions,
    caseEvents
  });
});

export default router;

