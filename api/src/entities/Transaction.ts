import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId
} from "typeorm";
import { Customer } from "./Customer";
import { Card } from "./Card";

@Entity({ name: "transactions" })
@Index(["customerId", "timestamp"], { unique: false })
@Index(["merchant"])
@Index(["mcc"])
@Index(["customerId", "merchant"])
@Index(["customerId", "txnId"], { unique: true })
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "txn_id" })
  txnId!: string;

  @ManyToOne(() => Customer, (customer) => customer.transactions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @RelationId((txn: Transaction) => txn.customer)
  customerId!: string;

  @ManyToOne(() => Card, (card) => card.transactions, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "card_id" })
  card!: Card;

  @RelationId((txn: Transaction) => txn.card)
  cardId!: string;

  @Column()
  mcc!: string;

  @Column()
  merchant!: string;

  @Column({ name: "amount_cents", type: "bigint" })
  amountCents!: string;

  @Column()
  currency!: string;

  @Column({ name: "ts", type: "timestamptz" })
  timestamp!: Date;

  @Column({ name: "device_id" })
  deviceId!: string;

  @Column()
  country!: string;

  @Column()
  city!: string;
}

