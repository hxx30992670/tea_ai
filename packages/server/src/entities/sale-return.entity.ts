import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sale_return' })
export class SaleReturnEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'return_no', type: 'text', unique: true, nullable: true })
  returnNo!: string | null;

  @Column({ name: 'sale_order_id', type: 'integer' })
  saleOrderId!: number;

  @Column({ name: 'total_amount', type: 'real', default: 0 })
  totalAmount!: number;

  @Column({ name: 'refund_amount', type: 'real', default: 0 })
  refundAmount!: number;

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
