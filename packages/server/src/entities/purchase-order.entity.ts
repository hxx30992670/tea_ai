/**
 * 采购订单实体
 * 记录采购订单主表信息，包含订单金额、已付款/退货金额等
 * 状态流转：draft → pending → confirmed → completed/cancelled
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'purchase_order' })
export class PurchaseOrderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'order_no', type: 'text', unique: true, nullable: true })
  orderNo!: string | null;

  @Column({ name: 'supplier_id', type: 'integer', nullable: true })
  supplierId!: number | null;

  @Column({ name: 'total_amount', type: 'real', default: 0 })
  totalAmount!: number;

  @Column({ name: 'paid_amount', type: 'real', default: 0 })
  paidAmount!: number;

  @Column({ name: 'returned_amount', type: 'real', default: 0 })
  returnedAmount!: number;

  @Column({ type: 'text', default: 'draft' })
  status!: string;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
