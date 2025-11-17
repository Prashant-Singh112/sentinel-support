import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Case } from "./Case";

@Entity({ name: "case_events" })
export class CaseEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Case, (caseEntity) => caseEntity.events, { onDelete: "CASCADE" })
  @JoinColumn({ name: "case_id" })
  case!: Case;

  @Column({ name: "case_id" })
  caseId!: string;

  @CreateDateColumn({ name: "ts" })
  timestamp!: Date;

  @Column()
  actor!: string;

  @Column()
  action!: string;

  @Column({ name: "payload_json", type: "jsonb" })
  payloadJson!: Record<string, unknown>;
}

