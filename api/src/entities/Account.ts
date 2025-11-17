import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId
} from "typeorm";
import { Customer } from "./Customer";

@Entity({ name: "accounts" })
export class Account {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Customer, (customer) => customer.accounts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @RelationId((account: Account) => account.customer)
  customerId!: string;

  @Column({ name: "balance_cents", type: "bigint" })
  balanceCents!: string;

  @Column()
  currency!: string;
}

