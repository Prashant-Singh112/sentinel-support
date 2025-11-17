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

@Entity({ name: "cards" })
export class Card {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Customer, (customer) => customer.cards, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @RelationId((card: Card) => card.customer)
  customerId!: string;

  @Column()
  last4!: string;

  @Column()
  network!: string;

  @Column()
  status!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @OneToMany(() => Transaction, (txn) => txn.card)
  transactions!: Transaction[];
}

