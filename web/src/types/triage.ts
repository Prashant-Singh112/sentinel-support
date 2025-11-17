export type TriageEvent =
  | { type: "plan_built"; plan: string[] }
  | { type: "tool_update"; tool: string; ok: boolean; detail: string; durationMs: number }
  | { type: "fallback_triggered"; reason: string }
  | {
      type: "decision_finalized";
      recommendation: string;
      risk: "low" | "medium" | "high";
      reasons: string[];
      action?: string;
    };

