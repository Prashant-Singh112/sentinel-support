import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn
} from "typeorm";
import { Alert } from "./Alert";
import { AgentTrace } from "./AgentTrace";

@Entity({ name: "triage_runs" })
export class TriageRun {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Alert, { onDelete: "CASCADE" })
  @JoinColumn({ name: "alert_id" })
  alert!: Alert;

  @RelationId((run: TriageRun) => run.alert)
  alertId!: string;

  @CreateDateColumn({ name: "started_at" })
  startedAt!: Date;

  @UpdateDateColumn({ name: "ended_at", nullable: true })
  endedAt?: Date;

  @Column({ name: "risk", type: "text" })
  risk!: string;

  @Column({ name: "reasons", type: "jsonb", default: () => "'[]'::jsonb" })
  reasons!: unknown[];

  @Column({ name: "fallback_used", default: false })
  fallbackUsed!: boolean;

  @Column({ name: "latency_ms", type: "int", nullable: true })
  latencyMs?: number;

  @OneToMany(() => AgentTrace, (trace) => trace.run)
  traces!: AgentTrace[];
}

