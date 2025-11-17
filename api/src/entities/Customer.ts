import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn
} from "typeorm";
import { Card } from "./Card";
import { Account } from "./Account";
import { Transaction } from "./Transaction";
import { Alert } from "./Alert";
import { Case } from "./Case";

@Entity({ name: "customers" })
export class Customer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ name: "email_masked" })
  emailMasked!: string;

  @Column({ name: "kyc_level" })
  kycLevel!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @OneToMany(() => Card, (card) => card.customer)
  cards!: Card[];

  @OneToMany(() => Account, (account) => account.customer)
  accounts!: Account[];

  @OneToMany(() => Transaction, (txn) => txn.customer)
  transactions!: Transaction[];

  @OneToMany(() => Alert, (alert) => alert.customer)
  alerts!: Alert[];

  @OneToMany(() => Case, (caseEntity) => caseEntity.customer)
  cases!: Case[];
}

