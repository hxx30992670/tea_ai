import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'stock_location' })
export class StockLocationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'warehouse_id', type: 'integer' })
  warehouseId!: number;

  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'integer', default: 1 })
  status!: number;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
