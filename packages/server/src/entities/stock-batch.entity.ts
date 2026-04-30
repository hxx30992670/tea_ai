import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'stock_batch' })
export class StockBatchEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ name: 'batch_no', type: 'text' })
  batchNo!: string;

  @Column({ name: 'warehouse_id', type: 'integer' })
  warehouseId!: number;

  @Column({ name: 'location_id', type: 'integer', nullable: true })
  locationId!: number | null;

  @Column({ type: 'real', default: 0 })
  quantity!: number;

  @Column({ name: 'locked_qty', type: 'real', default: 0 })
  lockedQty!: number;

  @Column({ name: 'cost_price', type: 'real', default: 0 })
  costPrice!: number;

  @Column({ name: 'production_date', type: 'datetime', nullable: true })
  productionDate!: string | null;

  @Column({ name: 'expire_at', type: 'datetime', nullable: true })
  expireAt!: string | null;

  @Column({ type: 'integer', default: 1 })
  status!: number;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: string | null;
}
