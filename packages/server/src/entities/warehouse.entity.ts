import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'warehouse' })
export class WarehouseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: 'main' })
  type!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'is_default', type: 'integer', default: 0 })
  isDefault!: number;

  @Column({ type: 'integer', default: 1 })
  status!: number;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
