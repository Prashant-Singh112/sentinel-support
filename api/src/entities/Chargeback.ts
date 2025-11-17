import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "chargebacks" })
export class Chargeback {
  @PrimaryColumn({ name: "customer_id", type: "uuid" })
  customerId!: string;

  @PrimaryColumn({ name: "txn_id", type: "uuid" })
  transactionId!: string;

  @Column()
  status!: string;

  @Column({ name: "opened_at", type: "timestamptz" })
  openedAt!: Date;
}

