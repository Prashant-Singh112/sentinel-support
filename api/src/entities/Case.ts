import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId
} from "typeorm";
import { Customer } from "./Customer";
import { Transaction } from "./Transaction";
import { CaseEvent } from "./CaseEvent";

@Entity({ name: "cases" })
export class Case {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Customer, (customer) => customer.cases, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @RelationId((caseEntity: Case) => caseEntity.customer)
  customerId!: string;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "txn_id" })
  transaction?: Transaction | null;

  @RelationId((caseEntity: Case) => caseEntity.transaction)
  transactionId?: string | null;

  @Column()
  type!: string;

  @Column()
  status!: string;

  @Column({ name: "reason_code", nullable: true })
  reasonCode?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @OneToMany(() => CaseEvent, (event) => event.case)
  events!: CaseEvent[];
}

