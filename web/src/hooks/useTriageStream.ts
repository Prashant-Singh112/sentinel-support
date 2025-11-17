import { useEffect, useState } from "react";
import type { TriageEvent } from "../types/triage";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const API_KEY = import.meta.env.VITE_API_KEY_AGENT ?? "agent-key";

export const useTriageStream = (runId: string | null) => {
  const [events, setEvents] = useState<TriageEvent[]>([]);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      return undefined;
    }

    const sessionId = crypto.randomUUID();
    const source = new EventSource(
      `${API_BASE}/api/triage/${runId}/stream?apiKey=${API_KEY}&sessionId=${sessionId}`
    );

    const pushEvent = (event: Event) => {
      const payload = JSON.parse((event as MessageEvent).data) as TriageEvent;
      setEvents((prev) => [...prev, payload]);
    };

    source.addEventListener("plan_built", pushEvent);
    source.addEventListener("tool_update", pushEvent);
    source.addEventListener("fallback_triggered", pushEvent);
    source.addEventListener("decision_finalized", pushEvent);

    return () => {
      source.close();
    };
  }, [runId]);

  const finalEvent = events.find((evt) => evt.type === "decision_finalized") as
    | Extract<TriageEvent, { type: "decision_finalized" }>
    | undefined;

  return { events, finalEvent };
};

