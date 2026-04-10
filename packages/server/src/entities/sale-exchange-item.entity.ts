import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sale_exchange_item' })
export class SaleExchangeItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'exchange_id', type: 'integer' })
  exchangeId!: number;

  @Column({ type: 'text' })
  direction!: string;

  @Column({ name: 'sale_order_item_id', type: 'integer', nullable: true })
  saleOrderItemId!: number | null;

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

  @Column({ type: 'real' })
  subtotal!: number;
}
