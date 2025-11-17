import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "kb_docs" })
export class KnowledgeBaseDoc {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  title!: string;

  @Column()
  anchor!: string;

  @Column({ name: "content_text", type: "text" })
  contentText!: string;
}

