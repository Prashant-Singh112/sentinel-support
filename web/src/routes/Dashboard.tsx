import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchDashboardKpis } from "../lib/api";

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

function KpiCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: fetchDashboardKpis
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading KPIs...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-rose-600">
        Unable to load dashboard metrics: {(error as Error).message}
      </p>
    );
  }

  if (!data) {
    return null;
  }

  const quickFilters = [
    { label: "Focus on high risk", risk: "high" },
    { label: "Medium backlog", risk: "medium" },
    { label: "Monitor lows", risk: "low" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Mission Control</h2>
          <p className="text-sm text-slate-500">
            Real-time triage posture, latency envelopes, and alert mix.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => navigate(`/alerts?risk=${filter.risk}`)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900 hover:text-slate-900"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Alerts in queue" value={formatNumber(data.alertsInQueue)} />
        <KpiCard label="Disputes open" value={formatNumber(data.disputesOpen)} />
        <KpiCard
          label="Avg triage latency"
          value={`${data.avgTriageLatencyMs} ms`}
          subtitle="p50 under 250 ms target"
        />
        <KpiCard label="p95 triage latency" value={`${data.p95TriageLatencyMs} ms`} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Alert mix</h3>
        <div className="mt-4 space-y-3">
          {data.alertsByRisk.map((bucket) => (
            <div key={bucket.risk} className="flex items-center gap-3">
              <div className="w-32 text-sm font-medium capitalize text-slate-700">{bucket.risk}</div>
              <div className="flex-1 rounded-full bg-slate-100">
                <div
                  className="rounded-full bg-slate-900 py-1 text-xs font-semibold text-white text-center"
                  style={{ width: `${bucket.count}%` }}
                >
                  {bucket.count}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

