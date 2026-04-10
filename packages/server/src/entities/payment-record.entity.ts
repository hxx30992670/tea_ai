import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_record' })
export class PaymentRecordEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  type!: string;

  @Column({ name: 'related_type', type: 'text' })
  relatedType!: string;

  @Column({ name: 'related_id', type: 'integer' })
  relatedId!: number;

  @Column({ type: 'real' })
  amount!: number;

  @Column({ type: 'text', nullable: true })
  method!: string | null;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
