import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Transaction } from "../entities/Transaction";
import { requireApiKey } from "../middleware/apiKey";
import { rateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/:customerId/summary", requireApiKey, rateLimit, async (req, res) => {
  const { customerId } = req.params;
  const repo = AppDataSource.getRepository(Transaction);

  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  const txns = await repo
    .createQueryBuilder("txn")
    .where("txn.customer_id = :customerId", { customerId })
    .andWhere("txn.ts >= :since", { since })
    .getMany();

  if (!txns.length) {
    return res.json({ categories: [], topMerchants: [], monthlyTrend: [], anomalies: [] });
  }

  const totalAmount = txns.reduce((sum, t) => sum + Number(t.amountCents), 0);
  const categoryMap = new Map<string, number>();
  const merchantMap = new Map<string, number>();
  const monthlyMap = new Map<string, number>();

  txns.forEach((txn) => {
    categoryMap.set(txn.mcc, (categoryMap.get(txn.mcc) ?? 0) + Number(txn.amountCents));
    merchantMap.set(txn.merchant, (merchantMap.get(txn.merchant) ?? 0) + 1);
    const monthKey = txn.timestamp.toISOString().slice(0, 7);
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + Number(txn.amountCents));
  });

  const categories = Array.from(categoryMap.entries())
    .map(([name, amt]) => ({
      name,
      pct: totalAmount ? amt / totalAmount : 0
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const topMerchants = Array.from(merchantMap.entries())
    .map(([merchant, count]) => ({ merchant, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const monthlyTrend = Array.from(monthlyMap.entries())
    .map(([month, sum]) => ({ month, sum }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const mean = totalAmount / txns.length;
  const variance =
    txns.reduce((acc, txn) => acc + Math.pow(Number(txn.amountCents) - mean, 2), 0) / txns.length;
  const std = Math.sqrt(variance);
  const anomalies = txns
    .filter((txn) => Number(txn.amountCents) > mean + 2 * std)
    .map((txn) => ({
      ts: txn.timestamp,
      amountCents: txn.amountCents,
      merchant: txn.merchant,
      note: "Amount spike"
    }))
    .slice(0, 5);

  res.json({
    categories,
    topMerchants,
    monthlyTrend,
    anomalies
  });
});

export default router;

