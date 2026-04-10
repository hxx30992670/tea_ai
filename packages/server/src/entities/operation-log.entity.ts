import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'operation_log' })
export class OperationLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  module!: string;

  @Column({ type: 'text' })
  action!: string;

  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operatorId!: number | null;

  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
