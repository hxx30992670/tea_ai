import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ai_conversation' })
export class AiConversationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', type: 'integer', nullable: true })
  userId!: number | null;

  @Column({ name: 'session_id', type: 'text', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'text' })
  question!: string;

  @Column({ name: 'sql_generated', type: 'text', nullable: true })
  sqlGenerated!: string | null;

  @Column({ name: 'context_json', type: 'text', nullable: true })
  contextJson!: string | null;

  @Column({ name: 'rows_json', type: 'text', nullable: true })
  rowsJson!: string | null;

  @Column({ type: 'text' })
  answer!: string;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
