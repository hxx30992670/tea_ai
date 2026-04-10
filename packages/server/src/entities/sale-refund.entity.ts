import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sale_refund' })
export class SaleRefundEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'refund_no', type: 'text', unique: true, nullable: true })
  refundNo!: string | null;

  @Column({ name: 'sale_order_id', type: 'integer' })
  saleOrderId!: number;

  @Column({ type: 'real' })
  amount!: number;

  @Column({ type: 'text', nullable: true })
  method!: string | null;

  @Column({ name: 'reason_code', type: 'text', nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_note', type: 'text', nullable: true })
  reasonNote!: string | null;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
