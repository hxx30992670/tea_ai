import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'purchase_return' })
export class PurchaseReturnEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'return_no', type: 'text', unique: true, nullable: true })
  returnNo!: string | null;

  @Column({ name: 'purchase_order_id', type: 'integer' })
  purchaseOrderId!: number;

  @Column({ name: 'total_amount', type: 'real', default: 0 })
  totalAmount!: number;

  @Column({ name: 'refund_amount', type: 'real', default: 0 })
  refundAmount!: number;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
