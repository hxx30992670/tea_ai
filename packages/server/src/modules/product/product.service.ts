/**
 * 商品服务
 * 负责商品及分类的 CRUD、库存期初录入、扩展字段管理
 * 茶叶商品支持多单位（件+散）、批次追踪、保质期等专业特性
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ROLE_STAFF } from '../../common/constants/roles';
import { AuthUser } from '../../common/types/auth-user.type';
import { roundQuantity, compareQuantity } from '../../common/utils/precision.util';
import { CategoryEntity } from '../../entities/category.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockRecordEntity } from '../../entities/stock-record.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductExtSchemaService } from './product-ext-schema.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type CategoryTreeNode = CategoryEntity & { children: CategoryTreeNode[] };
type ProductExtData = Record<string, unknown>;

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly productExtSchemaService: ProductExtSchemaService,
  ) {}

  async getCategoryTree() {
    const categories = await this.categoryRepository.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });

    const categoryMap = new Map<number, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    categories.forEach((category) => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    categoryMap.forEach((category) => {
      if (category.parentId && categoryMap.has(category.parentId)) {
        categoryMap.get(category.parentId)?.children.push(category);
        return;
      }

      roots.push(category);
    });

    return roots;
  }

  async createCategory(dto: CreateCategoryDto) {
    await this.assertValidCategoryParent(undefined, dto.parentId);

    const category = this.categoryRepository.create({
      name: dto.name,
      parentId: dto.parentId ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.categoryRepository.save(category);
  }

  async updateCategory(id: number, dto: UpdateCategoryDto) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    if (dto.parentId !== undefined) {
      await this.assertValidCategoryParent(id, dto.parentId ?? null);
    }

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.parentId !== undefined) category.parentId = dto.parentId ?? null;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;

    return this.categoryRepository.save(category);
  }

  async deleteCategory(id: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    const hasChildren = await this.categoryRepository.findOne({ where: { parentId: id } });
    if (hasChildren) {
      throw new BadRequestException('该分类下还有子分类，请先删除子分类');
    }

    const hasProducts = await this.productRepository.findOne({ where: { categoryId: id } });
    if (hasProducts) {
      throw new BadRequestException('该分类下还有商品，请先移除或修改商品分类');
    }

    await this.categoryRepository.delete(id);
    return { success: true };
  }

  getProductMeta() {
    return {
      units: ['斤', '克', '两', '饼', '盒', '罐', '箱', '件', '提', '包', '袋'],
      seasons: ['春茶', '夏茶', '秋茶', '冬茶'],
      shelfLifePresets: {
        绿茶: 18,
        普洱: 0,
      },
      defaultExtFields: [
        { key: 'origin', label: '产地', type: 'input' },
        { key: 'year', label: '年份', type: 'number' },
        { key: 'season', label: '采摘季', type: 'select', source: 'seasons' },
        { key: 'shelfLife', label: '保质期(月)', type: 'number' },
        { key: 'unit', label: '单位', type: 'select', source: 'units' },
        { key: 'packageUnit', label: '包装单位', type: 'select', source: 'units' },
        { key: 'packageSize', label: '每包装数量', type: 'number' },
        { key: 'safeStock', label: '安全库存', type: 'number' },
        { key: 'batchNo', label: '批次号', type: 'input' },
        { key: 'spec', label: '规格', type: 'input' },
        { key: 'storageCond', label: '存储条件', type: 'input' },
      ],
      categoryFieldPresets: {
        绿茶: ['origin', 'year', 'season', 'shelfLife', 'unit', 'safeStock', 'batchNo'],
        普洱: ['origin', 'year', 'season', 'shelfLife', 'unit', 'safeStock', 'batchNo', 'storageCond'],
      },
    };
  }

  async getProducts(query: ProductQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.productRepository.createQueryBuilder('product');

    qb.where('product.deleted_at IS NULL');

    if (query.barcode) {
      qb.andWhere('product.barcode = :barcode', { barcode: query.barcode });
    }

    if (query.keyword) {
      qb.andWhere('(product.name LIKE :keyword OR product.sku LIKE :keyword OR product.barcode LIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }

    if (query.categoryId) {
      const categoryIds = await this.getCategoryAndDescendantIds(query.categoryId);
      if (categoryIds.length === 0) {
        return {
          list: [],
          total: 0,
          page,
          pageSize,
        };
      }

      qb.andWhere('product.category_id IN (:...categoryIds)', { categoryIds });
    }

    if (query.teaType) {
      qb.andWhere('product.tea_type = :teaType', { teaType: query.teaType });
    }

    if (typeof query.status === 'number') {
      qb.andWhere('product.status = :status', { status: query.status });
    }

    qb.orderBy('product.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    const categoryIds = Array.from(new Set(list.map((product) => product.categoryId).filter((id): id is number => !!id)));
    const categoryPathMap = await this.getCategoryPathMap(categoryIds);

    return {
      list: list.map((product) => ({
        ...this.serializeProduct(product, user),
        categoryName: product.categoryId ? categoryPathMap.get(product.categoryId)?.slice(-1)[0] : undefined,
        categoryPath: product.categoryId ? categoryPathMap.get(product.categoryId) : undefined,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getProductById(id: number, user: AuthUser) {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!product) {
      throw new NotFoundException('商品不存在');
    }
    const categoryPathMap = await this.getCategoryPathMap(product.categoryId ? [product.categoryId] : []);
    return {
      ...this.serializeProduct(product, user),
      categoryName: product.categoryId ? categoryPathMap.get(product.categoryId)?.slice(-1)[0] : undefined,
      categoryPath: product.categoryId ? categoryPathMap.get(product.categoryId) : undefined,
    };
  }

  private async getCategoryPathMap(categoryIds: number[]) {
    if (categoryIds.length === 0) {
      return new Map<number, string[]>();
    }

    const categories = await this.categoryRepository.find({
      select: ['id', 'name', 'parentId'],
    });

    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const pathMap = new Map<number, string[]>();

    for (const categoryId of categoryIds) {
      const path: string[] = [];
      const visited = new Set<number>();
      let currentId: number | null = categoryId;

      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const category = categoryMap.get(currentId);
        if (!category) break;
        path.unshift(category.name);
        currentId = category.parentId ?? null;
      }

      if (path.length > 0) {
        pathMap.set(categoryId, path);
      }
    }

    return pathMap;
  }

  private async assertValidCategoryParent(categoryId: number | undefined, parentId: number | null | undefined) {
    if (!parentId) {
      return;
    }

    if (categoryId && categoryId === parentId) {
      throw new BadRequestException('父分类不能选择当前分类');
    }

    const categories = await this.categoryRepository.find({
      select: ['id', 'parentId'],
    });

    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    if (!categoryMap.has(parentId)) {
      throw new BadRequestException('父分类不存在');
    }

    if (!categoryId) {
      return;
    }

    let currentId: number | null = parentId;
    const visited = new Set<number>();
    while (currentId) {
      if (visited.has(currentId)) {
        break;
      }
      if (currentId === categoryId) {
        throw new BadRequestException('不能将分类移动到自己的子分类下');
      }

      visited.add(currentId);
      currentId = categoryMap.get(currentId)?.parentId ?? null;
    }
  }

  private async getCategoryAndDescendantIds(categoryId: number) {
    const categories = await this.categoryRepository.find({
      select: ['id', 'parentId'],
    });

    const categoryMap = new Map<number, number[]>();
    let exists = false;
    for (const category of categories) {
      if (category.id === categoryId) {
        exists = true;
      }

      if (!category.parentId) {
        continue;
      }

      const siblingIds = categoryMap.get(category.parentId) ?? [];
      siblingIds.push(category.id);
      categoryMap.set(category.parentId, siblingIds);
    }

    if (!exists) {
      return [];
    }

    const ids: number[] = [];
    const queue = [categoryId];
    const visited = new Set<number>();
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);
      ids.push(currentId);
      queue.push(...(categoryMap.get(currentId) ?? []));
    }

    return ids;
  }

  async createProduct(dto: CreateProductDto, user: AuthUser) {
    const result = await this.dataSource.transaction(async (manager) => {
      await this.ensureCategoryExists(dto.categoryId);

      let sku = dto.sku;
      if (!sku) {
        sku = await this.generateSku(dto.categoryId, manager);
      }
      await this.ensureSkuAvailable(sku);

      const extData = this.normalizeExtData(dto.extData);
      const openingStockQty = roundQuantity(dto.stockQty ?? 0);

      const product = manager.getRepository(ProductEntity).create({
        name: dto.name,
        sku,
        categoryId: dto.categoryId ?? null,
        barcode: dto.barcode ?? null,
        spec: this.getString(extData, 'spec'),
        unit: this.getString(extData, 'unit') ?? '斤',
        costPrice: dto.costPrice ?? 0,
        sellPrice: dto.sellPrice ?? 0,
        stockQty: openingStockQty,
        safeStock: roundQuantity(this.getNumber(extData, 'safeStock') ?? 10),
        imageUrl: dto.imageUrl ?? null,
        status: dto.status ?? 1,
        remark: dto.remark ?? null,
        extData: this.stringifyExtData(extData),
        productionDate: dto.productionDate ?? null,
        teaType: this.getString(extData, 'teaType'),
        origin: this.getString(extData, 'origin'),
        year: this.getNumber(extData, 'year'),
        batchNo: this.getString(extData, 'batchNo'),
        season: this.getString(extData, 'season'),
        shelfLife: this.getNumber(extData, 'shelfLife') ?? 0,
        producedAt: dto.productionDate ?? null,
        storageCond: this.getString(extData, 'storageCond'),
      });

      const savedProduct = await manager.getRepository(ProductEntity).save(product);

      if (openingStockQty > 0) {
        await manager.getRepository(StockRecordEntity).save(
          manager.getRepository(StockRecordEntity).create({
            productId: savedProduct.id,
            type: 'in',
            reason: 'opening',
            quantity: openingStockQty,
            beforeQty: 0,
            afterQty: openingStockQty,
            unit: savedProduct.unit ?? null,
            relatedOrderId: null,
            operatorId: user.sub,
            remark: '商品建档时录入期初库存',
          }),
        );
      }

      return savedProduct;
    });

    this.productExtSchemaService.invalidate();
    return result;
  }

  async updateProduct(id: number, dto: UpdateProductDto, user: AuthUser) {
    const product = await this.productRepository.findOne({ where: { id, deletedAt: IsNull() } });
    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    if (dto.stockQty !== undefined && compareQuantity(dto.stockQty, product.stockQty) !== 0) {
      throw new BadRequestException('商品编辑不允许直接修改库存，请通过库存管理做入库/出库调整');
    }

    if (dto.categoryId !== undefined) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    if (dto.sku !== undefined && dto.sku !== product.sku) {
      await this.ensureSkuAvailable(dto.sku, id);
    }

    const extData = dto.extData !== undefined
      ? this.normalizeExtData(dto.extData)
      : this.parseExtData(product.extData);

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.sku !== undefined) product.sku = dto.sku ?? null;
    if (dto.barcode !== undefined) product.barcode = dto.barcode ?? null;
    if (dto.categoryId !== undefined) product.categoryId = dto.categoryId ?? null;
    if (dto.costPrice !== undefined) product.costPrice = dto.costPrice;
    if (dto.sellPrice !== undefined) product.sellPrice = dto.sellPrice;
    if (dto.stockQty !== undefined) product.stockQty = roundQuantity(dto.stockQty);
    if (dto.status !== undefined) product.status = dto.status;
    if (dto.remark !== undefined) product.remark = dto.remark ?? null;
    if (dto.imageUrl !== undefined) product.imageUrl = dto.imageUrl ?? null;

    if (dto.extData !== undefined) {
      product.extData = this.stringifyExtData(extData);
      product.spec = this.getString(extData, 'spec');
      product.unit = this.getString(extData, 'unit') ?? product.unit;
      product.safeStock = roundQuantity(this.getNumber(extData, 'safeStock') ?? product.safeStock);
      product.teaType = this.getString(extData, 'teaType');
      product.origin = this.getString(extData, 'origin');
      product.year = this.getNumber(extData, 'year');
      product.batchNo = this.getString(extData, 'batchNo');
      product.season = this.getString(extData, 'season');
      product.shelfLife = this.getNumber(extData, 'shelfLife') ?? 0;
      product.storageCond = this.getString(extData, 'storageCond');
    }

    if (dto.productionDate !== undefined) {
      product.productionDate = dto.productionDate ?? null;
      product.producedAt = dto.productionDate ?? null;
    }

    const saved = await this.productRepository.save(product);
    if (dto.extData !== undefined) {
      this.productExtSchemaService.invalidate();
    }
    return saved;
  }

  async deleteProduct(id: number) {
    const product = await this.productRepository.findOne({ where: { id, deletedAt: IsNull() } });
    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    product.status = 0;
    product.deletedAt = new Date().toISOString();
    await this.productRepository.save(product);
    this.productExtSchemaService.invalidate();

    return { success: true };
  }

  private async ensureCategoryExists(categoryId?: number) {
    if (!categoryId) {
      return;
    }

    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new BadRequestException('商品分类不存在');
    }
  }

  private async ensureSkuAvailable(sku?: string, ignoreId?: number) {
    if (!sku) {
      return;
    }

    const existing = await this.productRepository.findOne({
      where: { sku, deletedAt: IsNull() },
    });
    if (existing && existing.id !== ignoreId) {
      throw new BadRequestException('SKU 已存在');
    }
  }

  async generateSku(categoryId?: number, manager?: any): Promise<string> {
    const repo = manager?.getRepository(ProductEntity) ?? this.productRepository;
    const teaTypeMap: Record<string, string> = {
      '绿茶': 'LC',
      '红茶': 'HC',
      '白茶': 'BC',
      '普洱': 'PE',
      '乌龙茶': 'WL',
      '黄茶': 'HU',
      '黑茶': 'HE',
      '花茶': 'HUAC',
    };

    let prefix = 'SP';
    if (categoryId) {
      const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
      if (category) {
        const mappedPrefix = teaTypeMap[category.name];
        if (mappedPrefix) {
          prefix = mappedPrefix;
        } else {
          const asciiKey = category.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          // 兜底保证 SKU 前缀是 ASCII，便于 CODE128 条码打印
          prefix = asciiKey.length >= 2 ? asciiKey.slice(0, 4) : `C${String(category.id).padStart(2, '0')}`;
        }
      }
    }

    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    for (let seq = 1; seq <= 999; seq++) {
      const sku = `${prefix}${dateStr}${String(seq).padStart(3, '0')}`;
      const existing = await repo.findOne({ where: { sku, deletedAt: IsNull() } });
      if (!existing) {
        return sku;
      }
    }

    throw new BadRequestException('今日SKU已用完，请联系管理员');
  }

  private serializeProduct(product: ProductEntity, user: AuthUser) {
    const extData = this.mergeExtData(product)
    const serialized = {
      ...product,
      productionDate: product.productionDate ?? product.producedAt,
      producedAt: product.productionDate ?? product.producedAt,
      extData,
      barcode: this.getString(extData, 'barcode') ?? product.barcode,
      spec: this.getString(extData, 'spec') ?? product.spec,
      unit: this.getString(extData, 'unit') ?? product.unit,
      packageUnit: this.getString(extData, 'packageUnit'),
      packageSize: this.getNumber(extData, 'packageSize'),
      safeStock: this.getNumber(extData, 'safeStock') ?? product.safeStock,
      imageUrl: product.imageUrl,
      teaType: this.getString(extData, 'teaType') ?? product.teaType,
      origin: this.getString(extData, 'origin') ?? product.origin,
      year: this.getNumber(extData, 'year') ?? product.year,
      batchNo: this.getString(extData, 'batchNo') ?? product.batchNo,
      season: this.getString(extData, 'season') ?? product.season,
      shelfLife: this.getNumber(extData, 'shelfLife') ?? product.shelfLife,
      storageCond: this.getString(extData, 'storageCond') ?? product.storageCond,
    }

    if (user.role !== ROLE_STAFF) {
      return serialized;
    }

    return {
      ...serialized,
      costPrice: undefined,
    };
  }

  private parseExtData(extData: string | null) {
    if (!extData) {
      return {};
    }

    try {
      const parsed = JSON.parse(extData) as ProductExtData;
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  private normalizeExtData(extData?: Record<string, unknown>) {
    return Object.entries(extData ?? {}).reduce<ProductExtData>((result, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        result[key] = value;
      }
      return result;
    }, {});
  }

  private stringifyExtData(extData: ProductExtData) {
    const normalized = this.normalizeExtData(extData);
    return Object.keys(normalized).length > 0 ? JSON.stringify(normalized) : null;
  }

  private mergeExtData(product: ProductEntity) {
    return {
      ...this.parseExtData(product.extData),
      ...(product.barcode ? { barcode: product.barcode } : {}),
      ...(product.spec ? { spec: product.spec } : {}),
      ...(product.unit ? { unit: product.unit } : {}),
      ...(this.getString(this.parseExtData(product.extData), 'packageUnit') ? { packageUnit: this.getString(this.parseExtData(product.extData), 'packageUnit') } : {}),
      ...(this.getNumber(this.parseExtData(product.extData), 'packageSize') ? { packageSize: this.getNumber(this.parseExtData(product.extData), 'packageSize') } : {}),
      ...(product.safeStock !== undefined ? { safeStock: product.safeStock } : {}),
      ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      ...(product.teaType ? { teaType: product.teaType } : {}),
      ...(product.origin ? { origin: product.origin } : {}),
      ...(product.year !== null ? { year: product.year } : {}),
      ...(product.batchNo ? { batchNo: product.batchNo } : {}),
      ...(product.season ? { season: product.season } : {}),
      ...(product.shelfLife !== undefined ? { shelfLife: product.shelfLife } : {}),
      ...(product.storageCond ? { storageCond: product.storageCond } : {}),
    };
  }

  private getString(extData: ProductExtData, key: string) {
    const value = extData[key];
    return typeof value === 'string' ? value : null;
  }

  private getNumber(extData: ProductExtData, key: string) {
    const value = extData[key];
    return typeof value === 'number' ? value : null;
  }
}
