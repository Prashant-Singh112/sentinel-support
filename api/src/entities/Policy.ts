import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "policies" })
export class Policy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  code!: string;

  @Column()
  title!: string;

  @Column({ name: "content_text", type: "text" })
  contentText!: string;
}

