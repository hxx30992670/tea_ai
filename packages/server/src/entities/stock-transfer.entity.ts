import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'stock_transfer' })
export class StockTransferEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'transfer_no', type: 'text', unique: true, nullable: true })
  transferNo!: string | null;

  @Column({ name: 'from_warehouse_id', type: 'integer' })
  fromWarehouseId!: number;

  @Column({ name: 'from_location_id', type: 'integer', nullable: true })
  fromLocationId!: number | null;

  @Column({ name: 'to_warehouse_id', type: 'integer' })
  toWarehouseId!: number;

  @Column({ name: 'to_location_id', type: 'integer', nullable: true })
  toLocationId!: number | null;

  @Column({ type: 'text', default: 'done' })
  status!: string;

  @Column({ name: 'total_qty', type: 'real', default: 0 })
  totalQty!: number;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: string | null;
}
