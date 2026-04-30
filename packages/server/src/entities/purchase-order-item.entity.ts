import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'purchase_order_item' })
export class PurchaseOrderItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ name: 'batch_id', type: 'integer', nullable: true })
  batchId!: number | null;

  @Column({ name: 'batch_no', type: 'text', nullable: true })
  batchNo!: string | null;

  @Column({ name: 'warehouse_id', type: 'integer', nullable: true })
  warehouseId!: number | null;

  @Column({ name: 'location_id', type: 'integer', nullable: true })
  locationId!: number | null;

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

  @Column({ name: 'unit_price', type: 'real' })
  unitPrice!: number;

  @Column({ type: 'real' })
  subtotal!: number;
}
