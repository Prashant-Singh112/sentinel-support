import { Request, Router } from "express";
import { AppDataSource } from "../data-source";
import { Card } from "../entities/Card";
import { Case } from "../entities/Case";
import { Alert } from "../entities/Alert";
import { Transaction } from "../entities/Transaction";
import { requireApiKey } from "../middleware/apiKey";
import { rateLimit } from "../middleware/rateLimit";
import { getIdempotentResponse, setIdempotentResponse } from "../services/idempotency";
import { audit } from "../middleware/audit";
import { metrics } from "../observability/metrics";
import { enqueueCaseEvent } from "../jobs/caseEventWorker";

const router = Router();
const cardRepo = () => AppDataSource.getRepository(Card);
const caseRepo = () => AppDataSource.getRepository(Case);
const alertRepo = () => AppDataSource.getRepository(Alert);

const queueCaseEvent = async (
  caseId: string,
  actor: string,
  action: string,
  payload: Record<string, unknown>,
  req: Request
) => {
  await enqueueCaseEvent({
    caseId,
    actor,
    action,
    payload: {
      ...payload,
      requestId: req.requestId,
      sessionId: req.sessionId
    },
    requestId: req.requestId,
    sessionId: req.sessionId
  });
};

router.post("/freeze-card", requireApiKey, rateLimit, async (req, res) => {
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key required" });
  }

  const cached = await getIdempotentResponse(idempotencyKey);
  if (cached) {
    return res.json(cached);
  }

  const { cardId, otp, alertId } = req.body;
  if (!cardId) {
    return res.status(400).json({ error: "cardId required" });
  }

  const card = await cardRepo().findOne({ where: { id: cardId } });
  if (!card) {
    return res.status(404).json({ error: "Card not found" });
  }

  if (card.status === "FROZEN") {
    return res.json({ status: "FROZEN", requestId: req.requestId });
  }

  if (!otp && req.customerRole !== "lead") {
    metrics.actionBlockedTotal.inc({ policy: "otp_required" });
    const response = { status: "PENDING_OTP" as const, requestId: req.requestId };
    await setIdempotentResponse(idempotencyKey, response);
    return res.json(response);
  }

  if (otp && otp !== "123456") {
    return res.status(403).json({ error: "Invalid OTP" });
  }

  card.status = "FROZEN";
  await cardRepo().save(card);

  const freezeCase = await caseRepo().save(
    caseRepo().create({
      customerId: card.customerId,
      type: "CARD_FREEZE",
      status: "OPEN",
      reasonCode: otp ? "OTP_VERIFIED" : "LEAD_OVERRIDE"
    })
  );

  await queueCaseEvent(
    freezeCase.id,
    req.customerRole ?? "agent",
    "freeze_card",
    { cardId, alertId, otpProvided: Boolean(otp), policy: otp ? "OTP_REQUIRED" : "LEAD_OVERRIDE" },
    req
  );

  const response = { status: "FROZEN" as const, requestId: req.requestId };
  await setIdempotentResponse(idempotencyKey, response);
  audit(req.customerRole ?? "agent", "action.freeze-card", { cardId, alertId, caseId: freezeCase.id });
  res.json(response);
});

router.post("/open-dispute", requireApiKey, rateLimit, async (req, res) => {
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key required" });
  }

  const cached = await getIdempotentResponse(idempotencyKey);
  if (cached) {
    return res.json(cached);
  }

  const { txnId, reasonCode, confirm, customerId } = req.body;
  if (!txnId || !reasonCode || confirm !== true || !customerId) {
    return res
      .status(400)
      .json({ error: "txnId, customerId, reasonCode and confirm=true are required" });
  }

  const newCase = await caseRepo().save(
    caseRepo().create({
      customerId,
      transaction: { id: txnId } as Transaction,
      type: "DISPUTE",
      status: "OPEN",
      reasonCode
    })
  );

  await queueCaseEvent(
    newCase.id,
    req.customerRole ?? "agent",
    "open_dispute",
    { txnId, reasonCode },
    req
  );

  const response = { caseId: newCase.id, status: "OPEN" as const };
  await setIdempotentResponse(idempotencyKey, response);
  audit(req.customerRole ?? "agent", "action.open-dispute", response);
  res.json(response);
});

router.post("/contact-customer", requireApiKey, rateLimit, async (req, res) => {
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key required" });
  }

  const cached = await getIdempotentResponse(idempotencyKey);
  if (cached) {
    return res.json(cached);
  }

  const { customerId, channel, message, caseId } = req.body;
  if (!customerId || !channel || !message) {
    return res.status(400).json({ error: "customerId, channel and message are required" });
  }

  const targetCase = caseId
    ? await caseRepo().findOne({ where: { id: caseId } })
    : await caseRepo().save(
        caseRepo().create({
          customerId,
          type: "CONTACT",
          status: "OPEN"
        })
      );

  if (!targetCase) {
    return res.status(404).json({ error: "Case not found" });
  }

  await queueCaseEvent(
    targetCase.id,
    req.customerRole ?? "agent",
    "contact_customer",
    { channel, message },
    req
  );

  const response = { caseId: targetCase.id, status: targetCase.status };
  await setIdempotentResponse(idempotencyKey, response);
  audit(req.customerRole ?? "agent", "action.contact-customer", response);
  res.json(response);
});

router.post("/mark-false-positive", requireApiKey, rateLimit, async (req, res) => {
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key required" });
  }

  const cached = await getIdempotentResponse(idempotencyKey);
  if (cached) {
    return res.json(cached);
  }

  const { alertId, reason } = req.body;
  if (!alertId || !reason) {
    return res.status(400).json({ error: "alertId and reason required" });
  }

  const alert = await alertRepo().findOne({ where: { id: alertId } });
  if (!alert) {
    return res.status(404).json({ error: "Alert not found" });
  }

  alert.status = "CLOSED_FALSE_POSITIVE";
  await alertRepo().save(alert);

  const fpCase = await caseRepo().save(
    caseRepo().create({
      customerId: alert.customerId,
      type: "ALERT",
      status: "CLOSED",
      reasonCode: reason,
      transaction: alert.suspectTransactionId
        ? ({ id: alert.suspectTransactionId } as Transaction)
        : undefined
    })
  );

  await queueCaseEvent(
    fpCase.id,
    req.customerRole ?? "agent",
    "mark_false_positive",
    { alertId, reason },
    req
  );

  const response = { alertId: alert.id, status: alert.status };
  await setIdempotentResponse(idempotencyKey, response);
  audit(req.customerRole ?? "agent", "action.mark-false-positive", {
    alertId: alert.id,
    caseId: fpCase.id
  });
  res.json(response);
});

export default router;

