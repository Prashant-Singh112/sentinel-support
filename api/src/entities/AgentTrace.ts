import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn
} from "typeorm";
import { TriageRun } from "./TriageRun";

@Entity({ name: "agent_traces" })
export class AgentTrace {
  @ManyToOne(() => TriageRun, (run) => run.traces, { onDelete: "CASCADE" })
  @JoinColumn({ name: "run_id" })
  run!: TriageRun;

  @PrimaryColumn({ name: "run_id" })
  runId!: string;

  @PrimaryColumn()
  seq!: number;

  @Column()
  step!: string;

  @Column({ name: "ok", type: "boolean" })
  ok!: boolean;

  @Column({ name: "duration_ms", type: "int" })
  durationMs!: number;

  @Column({ name: "detail_json", type: "jsonb" })
  detailJson!: Record<string, unknown>;
}

