import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const apiLatency = new client.Histogram({
  name: "api_request_latency_ms",
  help: "API request latency in milliseconds",
  buckets: [50, 100, 250, 500, 1000],
  labelNames: ["route", "method", "status"]
});

const agentLatency = new client.Histogram({
  name: "agent_latency_ms",
  help: "Agent orchestration latency",
  buckets: [100, 250, 500, 1000, 2000, 5000]
});

const toolCallTotal = new client.Counter({
  name: "tool_call_total",
  help: "Total tool calls",
  labelNames: ["tool", "ok"]
});

const agentFallbackTotal = new client.Counter({
  name: "agent_fallback_total",
  help: "Fallback count per tool",
  labelNames: ["tool"]
});

const rateLimitBlocks = new client.Counter({
  name: "rate_limit_block_total",
  help: "Total rate limit blocks"
});

const actionBlockedTotal = new client.Counter({
  name: "action_blocked_total",
  help: "Count of actions blocked by policy",
  labelNames: ["policy"]
});

register.registerMetric(apiLatency);
register.registerMetric(agentLatency);
register.registerMetric(toolCallTotal);
register.registerMetric(agentFallbackTotal);
register.registerMetric(rateLimitBlocks);
register.registerMetric(actionBlockedTotal);

export const metrics = {
  register,
  apiLatency,
  agentLatency,
  toolCallTotal,
  agentFallbackTotal,
  rateLimitBlocks,
  actionBlockedTotal
};

