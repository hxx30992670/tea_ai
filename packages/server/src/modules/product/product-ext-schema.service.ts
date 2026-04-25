/**
 * 商品扩展字段 Schema 提取服务
 * 扫描 product.ext_data，聚合出 prompt-center 生成 SQL 时可引用的 key 清单与枚举值样本
 * 缓存 5 分钟，避免每次问答都扫全表
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ProductEntity } from '../../entities/product.entity';

export type ProductExtSchemaHints = {
  productExtKeys: string[];
  productExtValues: Record<string, string[]>;
  /** product 主表中可能承载专业属性描述的列（spec/remark/origin/...）及其样值 */
  productAttributeColumns: Record<string, string[]>;
};

/** 需要扫样值的商品主表列；key=数据库列名，value=ProductEntity 属性名 */
const ATTRIBUTE_COLUMNS: Array<{ column: string; prop: keyof ProductEntity }> = [
  { column: 'spec', prop: 'spec' },
  { column: 'unit', prop: 'unit' },
  { column: 'remark', prop: 'remark' },
  { column: 'origin', prop: 'origin' },
  { column: 'season', prop: 'season' },
  { column: 'batch_no', prop: 'batchNo' },
  { column: 'tea_type', prop: 'teaType' },
];

const CACHE_TTL_MS = 5 * 60_000;
const MAX_KEYS = 30;
const MAX_VALUES_PER_KEY = 20;
const IGNORED_KEYS = new Set([
  'teaType',
  'year',
  'unit',
  'packageUnit',
  'packageSize',
  'safeStock',
  'barcode',
  'imageUrl',
  'sellPrice',
  'costPrice',
  'stockQty',
  'status',
  'name',
  'sku',
  'spec',
  'remark',
  'origin',
  'season',
  'batchNo',
]);

@Injectable()
export class ProductExtSchemaService {
  private readonly logger = new Logger(ProductExtSchemaService.name);
  private cache: { hints: ProductExtSchemaHints; expireAt: number } | null = null;
  private pending: Promise<ProductExtSchemaHints> | null = null;

  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
  ) {}

  async getHints(): Promise<ProductExtSchemaHints> {
    if (this.cache && Date.now() < this.cache.expireAt) {
      return this.cache.hints;
    }
    if (this.pending) {
      return this.pending;
    }

    this.pending = this.aggregate()
      .then((hints) => {
        this.cache = { hints, expireAt: Date.now() + CACHE_TTL_MS };
        return hints;
      })
      .finally(() => {
        this.pending = null;
      });

    return this.pending;
  }

  invalidate() {
    this.cache = null;
  }

  private async aggregate(): Promise<ProductExtSchemaHints> {
    const rows = await this.productRepository.find({
      where: { status: 1, deletedAt: IsNull() },
      select: ['extData', ...ATTRIBUTE_COLUMNS.map((item) => item.prop)],
    });

    const valuesByKey = new Map<string, Set<string>>();
    const columnValues = new Map<string, Set<string>>();
    ATTRIBUTE_COLUMNS.forEach(({ column }) => columnValues.set(column, new Set<string>()));

    for (const row of rows) {
      if (row.extData) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(row.extData);
        } catch {
          parsed = null;
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
            if (IGNORED_KEYS.has(key)) continue;
            const values = valuesByKey.get(key) ?? new Set<string>();
            this.collectValues(raw, values);
            if (values.size > 0) {
              valuesByKey.set(key, values);
            }
          }
        }
      }

      for (const { column, prop } of ATTRIBUTE_COLUMNS) {
        const raw = row[prop];
        const set = columnValues.get(column);
        if (!set) continue;
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (trimmed) set.add(trimmed);
        } else if (typeof raw === 'number') {
          set.add(String(raw));
        }
      }
    }

    const sortedKeys = [...valuesByKey.keys()]
      .sort((a, b) => (valuesByKey.get(b)?.size ?? 0) - (valuesByKey.get(a)?.size ?? 0))
      .slice(0, MAX_KEYS);

    const productExtValues: Record<string, string[]> = {};
    for (const key of sortedKeys) {
      const set = valuesByKey.get(key);
      if (!set) continue;
      productExtValues[key] = [...set].slice(0, MAX_VALUES_PER_KEY);
    }

    const productAttributeColumns: Record<string, string[]> = {};
    for (const { column } of ATTRIBUTE_COLUMNS) {
      const set = columnValues.get(column);
      if (!set || set.size === 0) continue;
      productAttributeColumns[column] = [...set].slice(0, MAX_VALUES_PER_KEY);
    }

    return {
      productExtKeys: sortedKeys,
      productExtValues,
      productAttributeColumns,
    };
  }

  private collectValues(raw: unknown, collector: Set<string>) {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) collector.add(trimmed);
      return;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      collector.add(String(raw));
      return;
    }
    if (Array.isArray(raw)) {
      raw.forEach((item) => this.collectValues(item, collector));
      return;
    }
    if (raw && typeof raw === 'object') {
      Object.values(raw as Record<string, unknown>).forEach((item) =>
        this.collectValues(item, collector),
      );
    }
  }
}
