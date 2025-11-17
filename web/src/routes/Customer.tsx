import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomerTransactions, fetchCustomerInsights } from "../lib/api";

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();

  const timelineQuery = useQuery({
    queryKey: ["customer-transactions", id],
    queryFn: () => fetchCustomerTransactions(id!),
    enabled: Boolean(id)
  });

  const insightsQuery = useQuery({
    queryKey: ["customer-insights", id],
    queryFn: () => fetchCustomerInsights(id!),
    enabled: Boolean(id)
  });

  if (!id) {
    return <p className="text-sm text-slate-500">Select a customer from alerts to inspect details.</p>;
  }

  if (timelineQuery.isLoading || insightsQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading customer profile...</p>;
  }

  const errorMsg = (timelineQuery.error ?? insightsQuery.error) as Error | undefined;

  if (errorMsg) {
    return (
      <p className="text-sm text-rose-600">
        Unable to load customer data: {errorMsg.message}
      </p>
    );
  }

  const transactions = timelineQuery.data?.items ?? [];
  const insights = insightsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Customer timeline</h2>
        <p className="text-sm text-slate-500">
          Recent transactions and anomaly highlights for customer {id.slice(0, 8)}…
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h3 className="px-6 py-4 text-sm font-semibold text-slate-900">Recent transactions</h3>
          <ul className="divide-y divide-slate-100">
            {transactions.map((txn) => (
              <li key={txn.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{txn.merchant}</p>
                  <p className="text-xs text-slate-500">{new Date(txn.timestamp).toLocaleString()}</p>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  ₹{(Number(txn.amountCents) / 100).toLocaleString()}
                </p>
              </li>
            ))}
            {!transactions.length && (
              <li className="px-6 py-4 text-sm text-slate-500">No transactions available.</li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h3 className="px-6 py-4 text-sm font-semibold text-slate-900">Spend profile</h3>
          {insights ? (
            <div className="grid gap-4 px-6 pb-6 pt-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Category mix</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {insights.categories.map((cat) => (
                    <li key={cat.name} className="flex items-center justify-between">
                      <span>{cat.name}</span>
                      <span>{(cat.pct * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Top merchants</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {insights.topMerchants.map((merchant) => (
                    <li key={merchant.merchant} className="flex items-center justify-between">
                      <span>{merchant.merchant}</span>
                      <span>{merchant.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Anomalies</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {insights.anomalies.map((anomaly, idx) => (
                    <li key={`${anomaly.merchant}-${idx}`}>
                      <span className="font-semibold">{anomaly.merchant}</span>{" "}
                      {new Date(anomaly.ts).toLocaleDateString()} · ₹
                      {(Number(anomaly.amountCents) / 100).toLocaleString()} &mdash; {anomaly.note}
                    </li>
                  ))}
                  {!insights.anomalies.length && <li className="text-slate-500">No recent anomalies</li>}
                </ul>
              </div>
            </div>
          ) : (
            <p className="px-6 py-4 text-sm text-slate-500">No insights available.</p>
          )}
        </section>
      </div>
    </div>
  );
}
