import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'inventory_count' })
export class InventoryCountEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'count_no', type: 'text', unique: true, nullable: true })
  countNo!: string | null;

  @Column({ name: 'warehouse_id', type: 'integer', nullable: true })
  warehouseId!: number | null;

  @Column({ name: 'location_id', type: 'integer', nullable: true })
  locationId!: number | null;

  @Column({ type: 'text', default: 'done' })
  status!: string;

  @Column({ name: 'total_diff_qty', type: 'real', default: 0 })
  totalDiffQty!: number;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: string | null;
}
