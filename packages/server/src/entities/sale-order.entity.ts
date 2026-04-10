/**
 * 销售订单实体
 * 记录销售订单主表信息，包含订单金额、收款/退货/换货金额等
 * 状态流转：draft → pending → confirmed → completed/cancelled
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sale_order' })
export class SaleOrderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'order_no', type: 'text', unique: true, nullable: true })
  orderNo!: string | null;

  @Column({ name: 'customer_id', type: 'integer', nullable: true })
  customerId!: number | null;

  @Column({ name: 'total_amount', type: 'real', default: 0 })
  totalAmount!: number;

  @Column({ name: 'cost_amount', type: 'real', default: 0 })
  costAmount!: number;

  @Column({ name: 'received_amount', type: 'real', default: 0 })
  receivedAmount!: number;

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
