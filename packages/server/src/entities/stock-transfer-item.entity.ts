import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'stock_transfer_item' })
export class StockTransferItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'transfer_id', type: 'integer' })
  transferId!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ name: 'batch_id', type: 'integer' })
  batchId!: number;

  @Column({ type: 'real' })
  quantity!: number;

  @Column({ type: 'text', nullable: true })
  unit!: string | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;
}
