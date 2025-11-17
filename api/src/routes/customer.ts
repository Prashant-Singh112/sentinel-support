import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Transaction } from "../entities/Transaction";
import { decodeCursor, encodeCursor } from "../utils/cursor";
import { requireApiKey } from "../middleware/apiKey";
import { rateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/:id/transactions", requireApiKey, rateLimit, async (req, res) => {
  const customerId = req.params.id;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
  let from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;
  if (!from && req.query.last) {
    const last = parseInt(req.query.last as string, 10);
    if (!Number.isNaN(last)) {
      from = new Date(Date.now() - last * 24 * 60 * 60 * 1000);
    }
  }

  const cursor = req.query.cursor as string | undefined;

  const qb = AppDataSource.getRepository(Transaction)
    .createQueryBuilder("txn")
    .where("txn.customer_id = :customerId", { customerId })
    .orderBy("txn.ts", "DESC")
    .addOrderBy("txn.id", "DESC")
    .limit(limit + 1);

  if (from) {
    qb.andWhere("txn.ts >= :from", { from });
  }

  if (to) {
    qb.andWhere("txn.ts <= :to", { to });
  }

  if (cursor) {
    const { ts, id } = decodeCursor(cursor);
    qb.andWhere("(txn.ts, txn.id) < (:ts, :id)", { ts: new Date(ts), id });
  }

  const rows = await qb.getMany();
  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);
  const nextCursor = hasNext
    ? encodeCursor(items[items.length - 1].timestamp.toISOString(), items[items.length - 1].id)
    : null;

  res.json({ items, nextCursor });
});

export default router;

