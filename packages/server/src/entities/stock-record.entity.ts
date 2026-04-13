import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'stock_record' })
export class StockRecordEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'real' })
  quantity!: number;

  @Column({ name: 'package_qty', type: 'real', nullable: true })
  packageQty!: number | null;

  @Column({ name: 'loose_qty', type: 'real', nullable: true })
  looseQty!: number | null;

  @Column({ name: 'package_unit', type: 'text', nullable: true })
  packageUnit!: string | null;

  @Column({ name: 'package_size', type: 'integer', nullable: true })
  packageSize!: number | null;

  @Column({ name: 'before_qty', type: 'real' })
  beforeQty!: number;

  @Column({ name: 'after_qty', type: 'real' })
  afterQty!: number;

  @Column({ type: 'text', nullable: true })
  unit!: string | null;

  @Column({ name: 'related_order_id', type: 'integer', nullable: true })
  relatedOrderId!: number | null;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
