/**
 * 商品实体
 * 存储茶叶商品信息，支持普通字段及扩展字段（JSON 格式）
 * 茶叶专业字段：产地、年份、采摘季、批次号、保质期等
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'product' })
export class ProductEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true, nullable: true })
  sku!: string | null;

  @Column({ type: 'text', nullable: true })
  barcode!: string | null;

  @Column({ name: 'category_id', type: 'integer', nullable: true })
  categoryId!: number | null;

  @Column({ type: 'text', nullable: true })
  spec!: string | null;

  @Column({ type: 'text', default: '斤' })
  unit!: string;

  @Column({ name: 'cost_price', type: 'real', default: 0 })
  costPrice!: number;

  @Column({ name: 'sell_price', type: 'real', default: 0 })
  sellPrice!: number;

  @Column({ name: 'stock_qty', type: 'integer', default: 0 })
  stockQty!: number;

  @Column({ name: 'safe_stock', type: 'integer', default: 10 })
  safeStock!: number;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'integer', default: 1 })
  status!: number;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ name: 'ext_data', type: 'text', nullable: true })
  extData!: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt!: string | null;

  @Column({ name: 'production_date', type: 'datetime', nullable: true })
  productionDate!: string | null;

  @Column({ name: 'tea_type', type: 'text', nullable: true })
  teaType!: string | null;

  @Column({ type: 'text', nullable: true })
  origin!: string | null;

  @Column({ type: 'integer', nullable: true })
  year!: number | null;

  @Column({ name: 'batch_no', type: 'text', nullable: true })
  batchNo!: string | null;

  @Column({ type: 'text', nullable: true })
  season!: string | null;

  @Column({ name: 'shelf_life', type: 'integer', default: 0 })
  shelfLife!: number;

  @Column({ name: 'produced_at', type: 'datetime', nullable: true })
  producedAt!: string | null;

  @Column({ name: 'storage_cond', type: 'text', nullable: true })
  storageCond!: string | null;
}
