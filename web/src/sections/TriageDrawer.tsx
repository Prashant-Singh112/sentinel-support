import { useEffect, useMemo, useRef, useState } from "react";
import type { AlertSummary } from "../lib/api";
import { postJson } from "../lib/api";
import { useTriageStream } from "../hooks/useTriageStream";

interface TriageDrawerProps {
  open: boolean;
  alert: AlertSummary | null;
  runId: string | null;
  detail: {
    suspectTransaction: AlertSummary["suspectTransaction"];
    customer: AlertSummary["customer"];
  } | null;
  onClose: () => void;
}

const formatAmount = (amountCents?: string, currency = "INR") =>
  amountCents ? new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amountCents) / 100) : "--";

export default function TriageDrawer({ open, alert, runId, detail, onClose }: TriageDrawerProps) {
  const { events, finalEvent } = useTriageStream(runId);
  const [otp, setOtp] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [open, onClose]);

  const suspect = detail?.suspectTransaction;
  const executionPlan = useMemo(() => events.filter((evt) => evt.type === "tool_update"), [events]);

  const runAction = async (handler: () => Promise<void>) => {
    try {
      setBusy(true);
      await handler();
      setActionMessage("Action completed");
    } catch (err) {
      setActionMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const freezeCard = () =>
    runAction(async () => {
      if (!suspect?.cardId) throw new Error("Missing card reference");
      await postJson("/api/action/freeze-card", { cardId: suspect.cardId, otp: otp || undefined });
    });

  const openDispute = () =>
    runAction(async () => {
      if (!suspect?.id) throw new Error("Missing transaction reference");
      await postJson("/api/action/open-dispute", {
        txnId: suspect.id,
        customerId: alert!.customer.id,
        reasonCode: "10.4",
        confirm: true
      });
    });

  const contactCustomer = () =>
    runAction(async () => {
      await postJson("/api/action/contact-customer", {
        customerId: alert!.customer.id,
        channel: "sms",
        message: "Console outreach initiated"
      });
    });

  const markFalsePositive = () =>
    runAction(async () => {
      await postJson("/api/action/mark-false-positive", {
        alertId: alert!.id,
        reason: "False positive confirmed by agent review"
      });
    });

  if (!open || !alert) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-20 flex bg-slate-900/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div ref={drawerRef} className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Triage run</p>
            <p className="text-base font-semibold text-slate-900">{alert.customer.name}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            Close
          </button>
        </div>

        {/* ARIA live region for streaming updates */}
        <div aria-live="polite" aria-atomic="false" className="sr-only">
          {events.length > 0 && (
            <span>
              {events[events.length - 1].type === "tool_update"
                ? `Tool ${events[events.length - 1].tool} ${events[events.length - 1].ok ? "completed" : "failed"}`
                : events[events.length - 1].type === "decision_finalized"
                  ? `Decision finalized: ${finalEvent?.recommendation ?? "pending"}`
                  : `Event: ${events[events.length - 1].type}`}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <section className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Suspect transaction</p>
            <p className="text-sm font-medium text-slate-900">
              {suspect?.merchant ?? "Unknown"} · {formatAmount(suspect?.amountCents)}
            </p>
            <p className="text-xs text-slate-500">{suspect ? new Date(suspect.ts).toLocaleString() : "--"}</p>
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Plan</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700">
              {executionPlan.map((evt, idx) => (
                <li key={`${evt.tool}-${idx}`}>
                  <span className="font-semibold">{evt.tool}</span> &middot;{" "}
                  <span className={evt.ok ? "text-emerald-600" : "text-rose-600"}>
                    {evt.ok ? "ok" : evt.detail}
                  </span>{" "}
                  ({evt.durationMs} ms)
                </li>
              ))}
              {!executionPlan.length && <li className="text-slate-500">Waiting for planner…</li>}
            </ol>
          </section>

          <section className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Trace</p>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-800">
              {events.map((event, index) => (
                <div key={`${event.type}-${index}`} className="mb-2">
                  <span className="font-semibold">{event.type}</span>{" "}
                  <span className="text-slate-500">{JSON.stringify(event)}</span>
                </div>
              ))}
              {!events.length && <p className="text-slate-500">Waiting for streaming events...</p>}
            </div>
          </section>

          {finalEvent && (
            <section className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Recommendation</p>
              <p className="text-lg font-semibold text-slate-900">{finalEvent.recommendation}</p>
              <p className="text-xs text-slate-500">
                Risk classified as <strong>{finalEvent.risk}</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                {finalEvent.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={freezeCard}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Freeze card
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={openDispute}
              className="rounded-lg border border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-50"
            >
              Open dispute
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={contactCustomer}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Contact customer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={markFalsePositive}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Mark False Positive
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="OTP (optional)"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
            <p className="text-xs text-slate-500">Required for freeze overrides</p>
          </div>
          {actionMessage && <p className="text-xs text-slate-600">{actionMessage}</p>}
        </div>
      </div>
    </div>
  );
}

