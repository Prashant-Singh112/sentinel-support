export default function EvalsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Eval cockpit</h2>
        <p className="text-sm text-slate-500">
          Golden flows for OTP, disputes, risk fallbacks, rate limits, and PII surfaces.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          CI-safe evals run locally via{" "}
          <code className="rounded bg-slate-900 px-2 py-1 text-xs text-white">npm run eval -w api</code>.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Freeze + OTP flow</li>
          <li>ABC Mart dispute creation w/ reason 10.4</li>
          <li>Duplicate QuickCab explanation</li>
          <li>Risk tool fallback budget</li>
          <li>Rate limit enforcement</li>
          <li>PII redaction inside audit and traces</li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Full JSON specs live under <code>/fixtures/evals</code>; CLI output is persisted alongside
          Prometheus metrics and audit artifacts.
        </p>
      </div>
    </div>
  );
}

