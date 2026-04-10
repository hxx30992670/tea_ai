import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'system_setting' })
export class SystemSettingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  key!: string;

  @Column({ type: 'text', nullable: true })
  value!: string | null;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: string;
}
