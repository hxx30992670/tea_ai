import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'follow_up' })
export class FollowUpEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_id', type: 'integer' })
  customerId!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'follow_type', type: 'text', nullable: true })
  followType!: 'call' | 'wechat' | 'visit' | 'other' | null;

  @Column({ name: 'intent_level', type: 'text', nullable: true })
  intentLevel!: 'high' | 'medium' | 'low' | 'lost' | null;

  @Column({ name: 'next_follow_date', type: 'datetime', nullable: true })
  nextFollowDate!: string | null;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
