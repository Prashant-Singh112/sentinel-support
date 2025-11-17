import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AlertSummary } from "../lib/api";
import { fetchAlertDetail, fetchAlerts, startTriage } from "../lib/api";
import TriageDrawer from "../sections/TriageDrawer";

const RISK_FILTERS = ["all", "high", "medium", "low"] as const;
const STATUS_FILTERS = ["OPEN", "CLOSED"] as const;

export default function AlertsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selection, setSelection] = useState<{ alert: AlertSummary; runId: string } | null>(null);

  const riskFilter = (searchParams.get("risk") ?? "all") as (typeof RISK_FILTERS)[number];
  const statusFilter = (searchParams.get("status") ?? "OPEN") as (typeof STATUS_FILTERS)[number];

  const listQuery = useQuery({
    queryKey: ["alerts", riskFilter, statusFilter],
    queryFn: () =>
      fetchAlerts({
        risk: riskFilter === "all" ? undefined : riskFilter,
        status: statusFilter
      })
  });

  const alerts = listQuery.data?.items ?? [];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: alerts.length,
    estimateSize: () => 96,
    getScrollElement: () => containerRef.current
  });

  const { data: alertDetail } = useQuery({
    queryKey: ["alert-detail", selection?.alert.id],
    queryFn: () => (selection ? fetchAlertDetail(selection.alert.id) : Promise.resolve(null)),
    enabled: Boolean(selection?.alert.id)
  });

  const handleTriage = async (alert: AlertSummary) => {
    const run = await startTriage(alert.id);
    setSelection({ alert, runId: run.runId });
  };

  const applyFilter = (next: Partial<{ risk: string; status: string }>) => {
    const updated = new URLSearchParams(searchParams);
    if (next.risk) {
      updated.set("risk", next.risk);
    }
    if (next.status) {
      updated.set("status", next.status);
    }
    setSearchParams(updated);
  };

  const riskBadge = useMemo(
    () => ({
      high: "bg-rose-100 text-rose-700 border-rose-200",
      medium: "bg-amber-100 text-amber-700 border-amber-200",
      low: "bg-emerald-100 text-emerald-700 border-emerald-200"
    }),
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Alert queue</h2>
          <p className="text-sm text-slate-500">
            Streaming SSE triage with keyboard-friendly drawer controls.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Risk</span>
            {RISK_FILTERS.map((risk) => (
              <button
                key={risk}
                type="button"
                onClick={() => applyFilter({ risk })}
                className={`rounded-full border px-3 py-1 capitalize ${
                  riskFilter === risk
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {risk}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Status</span>
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => applyFilter({ status })}
                className={`rounded-full border px-3 py-1 ${
                  statusFilter === status
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-[640px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        {listQuery.isLoading && (
          <p className="p-6 text-sm text-slate-500">Loading alerts...</p>
        )}
        {listQuery.error && (
          <p className="p-6 text-sm text-rose-600">
            Failed to load alerts: {(listQuery.error as Error).message}
          </p>
        )}
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative"
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const alert = alerts[virtualRow.index];
            return (
              <div
                key={alert.id}
                className="absolute left-0 right-0 border-b border-slate-100 px-6 py-4"
                style={{
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{alert.customer.name}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(alert.createdAt).toLocaleString()}
                    </p>
                    {alert.suspectTransaction && (
                      <p className="text-xs text-slate-500">
                        {alert.suspectTransaction.merchant} · ₹
                        {(Number(alert.suspectTransaction.amountCents) / 100).toLocaleString()}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/customer/${alert.customer.id}`)}
                      className="mt-1 text-xs font-semibold text-slate-600 underline"
                    >
                      View timeline
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                        riskBadge[alert.risk as keyof typeof riskBadge] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {alert.risk}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTriage(alert)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:ring-offset-2"
                    >
                      Open triage
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TriageDrawer
        open={Boolean(selection)}
        alert={selection?.alert ?? null}
        runId={selection?.runId ?? null}
        detail={alertDetail ?? null}
        onClose={() => setSelection(null)}
      />
    </div>
  );
}

