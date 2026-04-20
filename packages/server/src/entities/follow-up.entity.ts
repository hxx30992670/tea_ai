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

  @Column({ type: 'text', default: 'pending' })
  status!: 'pending' | 'completed' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  feedback!: string | null;

  @Column({ name: 'next_follow_date', type: 'datetime', nullable: true })
  nextFollowDate!: string | null;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ name: 'completed_by', type: 'integer', nullable: true })
  completedBy!: number | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: string | null;

  @Column({ name: 'cancelled_by', type: 'integer', nullable: true })
  cancelledBy!: number | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt!: string | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: string;
}
