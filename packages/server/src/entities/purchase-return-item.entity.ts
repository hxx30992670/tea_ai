import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'purchase_return_item' })
export class PurchaseReturnItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'return_id', type: 'integer' })
  returnId!: number;

  @Column({ name: 'purchase_order_item_id', type: 'integer' })
  purchaseOrderItemId!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

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
