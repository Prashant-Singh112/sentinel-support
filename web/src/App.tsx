import { NavLink, Outlet } from "react-router-dom";
import { clsx } from "clsx";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/alerts", label: "Alerts" },
  { to: "/evals", label: "Eval Lab" }
];

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-slate-200 bg-white">
          <div className="px-6 py-6 border-b border-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sentinel Support</p>
            <h1 className="text-2xl font-semibold text-slate-900">Case Console</h1>
            <p className="text-xs text-slate-500 mt-1">Secure agent workspace</p>
          </div>
          <nav className="px-4 py-6 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    "block rounded-md px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
            <div className="flex items-center justify-between px-8 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Guardrail posture</p>
                <p className="text-sm text-slate-900">
                  API latency &middot; streaming health &middot; OTP policy
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                Authenticated as <strong className="font-semibold text-slate-900">agent</strong>
              </div>
            </div>
          </header>
          <div className="px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
