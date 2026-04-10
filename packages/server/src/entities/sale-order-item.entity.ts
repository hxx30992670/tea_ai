import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sale_order_item' })
export class SaleOrderItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'package_qty', type: 'integer', nullable: true })
  packageQty!: number | null;

  @Column({ name: 'loose_qty', type: 'integer', nullable: true })
  looseQty!: number | null;

  @Column({ name: 'package_unit', type: 'text', nullable: true })
  packageUnit!: string | null;

  @Column({ name: 'package_size', type: 'integer', nullable: true })
  packageSize!: number | null;

  @Column({ name: 'unit_price', type: 'real' })
  unitPrice!: number;

  @Column({ name: 'cost_price', type: 'real' })
  costPrice!: number;

  @Column({ type: 'real' })
  subtotal!: number;
}
