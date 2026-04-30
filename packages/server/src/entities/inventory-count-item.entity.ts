import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'inventory_count_item' })
export class InventoryCountItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'count_id', type: 'integer' })
  countId!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ name: 'batch_id', type: 'integer', nullable: true })
  batchId!: number | null;

  @Column({ name: 'warehouse_id', type: 'integer', nullable: true })
  warehouseId!: number | null;

  @Column({ name: 'location_id', type: 'integer', nullable: true })
  locationId!: number | null;

  @Column({ name: 'book_qty', type: 'real', default: 0 })
  bookQty!: number;

  @Column({ name: 'counted_qty', type: 'real', default: 0 })
  countedQty!: number;

  @Column({ name: 'diff_qty', type: 'real', default: 0 })
  diffQty!: number;

  @Column({ type: 'text', nullable: true })
  unit!: string | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;
}
