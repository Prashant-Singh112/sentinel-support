import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "devices" })
export class KnownDevice {
  @PrimaryColumn({ name: "customer_id", type: "uuid" })
  customerId!: string;

  @PrimaryColumn({ name: "device_id" })
  deviceId!: string;

  @Column({ name: "last_seen", type: "timestamptz" })
  lastSeen!: Date;
}

