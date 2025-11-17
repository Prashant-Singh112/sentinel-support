const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const API_KEY = import.meta.env.VITE_API_KEY_AGENT ?? "agent-key";

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

const buildQueryString = (params?: Record<string, string | undefined>) => {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== "all") {
      search.append(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
};

export const apiFetch = async <T>(path: string, options: RequestOptions = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...options.headers
    }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
};

export const postJson = async <T>(path: string, body: unknown) =>
  apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": crypto.randomUUID() }
  });

export const startTriage = (alertId: string) =>
  postJson<{ runId: string; alertId: string }>("/api/triage", { alertId });

export const fetchDashboardKpis = () =>
  apiFetch<{
    alertsInQueue: number;
    disputesOpen: number;
    avgTriageLatencyMs: number;
    p95TriageLatencyMs: number;
    alertsByRisk: { risk: string; count: number }[];
  }>("/api/dashboard/kpis");

export interface AlertSummary {
  id: string;
  risk: string;
  status: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    kycLevel: string;
  };
  suspectTransaction: {
    id: string;
    merchant: string;
    amountCents: string;
    currency?: string;
    ts: string;
    cardId?: string;
  } | null;
}

export const fetchAlerts = (params?: { risk?: string; status?: string }) =>
  apiFetch<{ items: AlertSummary[]; nextCursor: string | null }>(
    `/api/alerts${buildQueryString(params)}`
  );

export const fetchAlertDetail = (id: string) =>
  apiFetch<{
    alert: AlertSummary;
    customer: AlertSummary["customer"];
    suspectTransaction: AlertSummary["suspectTransaction"];
    recentTransactions: Array<{
      id: string;
      merchant: string;
      amountCents: string;
      currency: string;
      timestamp: string;
    }>;
    caseEvents: Array<{ id: string; action: string; actor: string; timestamp: string }>;
  }>(`/api/alerts/${id}`);

export const fetchCustomerTransactions = (customerId: string) =>
  apiFetch<{
    items: Array<{
      id: string;
      merchant: string;
      amountCents: string;
      currency: string;
      timestamp: string;
    }>;
    nextCursor: string | null;
  }>(`/api/customer/${customerId}/transactions${buildQueryString({ limit: "200" })}`);

export interface CustomerInsights {
  categories: Array<{ name: string; pct: number }>;
  topMerchants: Array<{ merchant: string; count: number }>;
  monthlyTrend: Array<{ month: string; sum: number }>;
  anomalies: Array<{ ts: string; amountCents: string; merchant: string; note: string }>;
}

export const fetchCustomerInsights = (customerId: string) =>
  apiFetch<CustomerInsights>(`/api/insights/${customerId}/summary`);

