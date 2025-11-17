import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { AppDataSource } from "../data-source";
import { Transaction } from "../entities/Transaction";
import { requireApiKey } from "../middleware/apiKey";
import { rateLimit } from "../middleware/rateLimit";
import { getIdempotentResponse, setIdempotentResponse } from "../services/idempotency";
import { audit } from "../middleware/audit";

const router = Router();
const upload = multer();

const txnRepo = () => AppDataSource.getRepository(Transaction);

type IncomingTransaction = Partial<Transaction> & {
  txnId: string;
  customerId: string;
};

router.post("/", requireApiKey, rateLimit, upload.single("file"), async (req, res) => {
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key header required" });
  }

  const cached = await getIdempotentResponse<{ accepted: boolean; count: number; requestId: string }>(idempotencyKey);
  if (cached) {
    return res.json(cached);
  }

  let records: IncomingTransaction[] = [];
  try {
    if (req.file) {
      const csvText = req.file.buffer.toString("utf-8");
      const parsed = parse<Record<string, string>>(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      records = parsed.map((row) => ({
        txnId: row.txnId,
        customerId: row.customerId,
        cardId: row.cardId,
        mcc: row.mcc,
        merchant: row.merchant,
        amountCents: row.amountCents,
        currency: row.currency,
        timestamp: new Date(row.ts),
        deviceId: row.deviceId,
        country: row.country,
        city: row.city
      }));
    } else if (Array.isArray(req.body)) {
      records = req.body as IncomingTransaction[];
    } else if (Array.isArray(req.body.transactions)) {
      records = req.body.transactions as IncomingTransaction[];
    } else {
      return res.status(400).json({ error: "Provide CSV file or JSON array" });
    }
  } catch (error) {
    return res.status(400).json({ error: "Unable to parse payload", detail: (error as Error).message });
  }

  const repo = txnRepo();
  await repo.upsert(
    records.map((r) => ({
      txnId: r.txnId,
      customerId: r.customerId,
      cardId: r.cardId,
      mcc: r.mcc,
      merchant: r.merchant,
      amountCents: r.amountCents,
      currency: r.currency,
      timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
      deviceId: r.deviceId,
      country: r.country,
      city: r.city
    })),
    ["customerId", "txnId"]
  );

  const response = { accepted: true, count: records.length, requestId: req.requestId ?? "" };
  await setIdempotentResponse(idempotencyKey, response);
  audit(req.customerRole ?? "agent", "ingest.transactions", { requestId: req.requestId, count: records.length });
  res.json(response);
});

export default router;

