import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sale_exchange' })
export class SaleExchangeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'exchange_no', type: 'text', unique: true, nullable: true })
  exchangeNo!: string | null;

  @Column({ name: 'sale_order_id', type: 'integer' })
  saleOrderId!: number;

  @Column({ name: 'return_amount', type: 'real', default: 0 })
  returnAmount!: number;

  @Column({ name: 'exchange_amount', type: 'real', default: 0 })
  exchangeAmount!: number;

  @Column({ name: 'refund_amount', type: 'real', default: 0 })
  refundAmount!: number;

  @Column({ name: 'receive_amount', type: 'real', default: 0 })
  receiveAmount!: number;

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
