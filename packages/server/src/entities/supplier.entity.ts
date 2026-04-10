import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'supplier' })
export class SupplierEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'contact_name', type: 'text', nullable: true })
  contactName!: string | null;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'supply_category', type: 'text', nullable: true })
  supplyCategory!: string | null;

  @Column({ name: 'payment_terms_type', type: 'text', nullable: true })
  paymentTermsType!: 'cash' | 'contract' | 'days' | null;

  @Column({ name: 'payment_days', type: 'integer', nullable: true })
  paymentDays!: number | null;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
