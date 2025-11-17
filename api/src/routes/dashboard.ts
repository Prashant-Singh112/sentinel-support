import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Alert } from "../entities/Alert";
import { Case } from "../entities/Case";
import { TriageRun } from "../entities/TriageRun";
import { requireApiKey } from "../middleware/apiKey";

const router = Router();

router.get("/kpis", requireApiKey, async (_req, res) => {
  const alertRepo = AppDataSource.getRepository(Alert);
  const caseRepo = AppDataSource.getRepository(Case);
  const triageRepo = AppDataSource.getRepository(TriageRun);

  const [alertsOpen, disputesOpen, latencyRows, riskCounts] = await Promise.all([
    alertRepo.count({ where: { status: "OPEN" } }),
    caseRepo.count({ where: { type: "DISPUTE", status: "OPEN" } }),
    triageRepo
      .createQueryBuilder("run")
      .select(["run.latencyMs"])
      .where("run.latencyMs IS NOT NULL")
      .orderBy("run.started_at", "DESC")
      .limit(250)
      .getMany(),
    alertRepo
      .createQueryBuilder("alert")
      .select("alert.risk", "risk")
      .addSelect("COUNT(*)", "count")
      .groupBy("alert.risk")
      .getRawMany<{ risk: string; count: string }>()
  ]);

  const latencies = latencyRows.map((row) => row.latencyMs ?? 0);
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : 0;
  const p95Latency =
    latencies.length > 0
      ? latencies
          .slice()
          .sort((a, b) => a - b)[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
      : 0;

  res.json({
    alertsInQueue: alertsOpen,
    disputesOpen,
    avgTriageLatencyMs: avgLatency,
    p95TriageLatencyMs: p95Latency,
    alertsByRisk: riskCounts.map((entry) => ({
      risk: entry.risk,
      count: Number(entry.count)
    }))
  });
});

export default router;

