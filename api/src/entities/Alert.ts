import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId
} from "typeorm";
import { Customer } from "./Customer";
import { Transaction } from "./Transaction";

@Entity({ name: "alerts" })
export class Alert {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Customer, (customer) => customer.alerts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @RelationId((alert: Alert) => alert.customer)
  customerId!: string;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "suspect_txn_id" })
  suspectTransaction?: Transaction | null;

  @RelationId((alert: Alert) => alert.suspectTransaction)
  suspectTransactionId?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Column({ name: "risk", type: "text" })
  risk!: string;

  @Column({ name: "status", type: "text" })
  status!: string;
}

