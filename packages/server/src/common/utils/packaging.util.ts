import { ProductEntity } from '../../entities/product.entity';

type QuantityInput = {
  quantity?: number;
  packageQty?: number;
  looseQty?: number;
};

type PackageConfig = {
  baseUnit: string;
  packageUnit: string | null;
  packageSize: number | null;
};

export function getProductPackageConfig(product: Pick<ProductEntity, 'unit' | 'extData'>): PackageConfig {
  let extData: Record<string, unknown> = {};
  if (product.extData) {
    try {
      extData = JSON.parse(product.extData) as Record<string, unknown>;
    } catch {
      extData = {};
    }
  }

  const packageUnit = typeof extData.packageUnit === 'string' ? extData.packageUnit : null;
  const packageSizeRaw = typeof extData.packageSize === 'number' ? extData.packageSize : Number(extData.packageSize);
  const packageSize = Number.isFinite(packageSizeRaw) && packageSizeRaw > 1 ? Math.floor(packageSizeRaw) : null;

  return {
    baseUnit: product.unit,
    packageUnit,
    packageSize,
  };
}

export function resolveCompositeQuantity(input: QuantityInput, config: PackageConfig) {
  const normalizedPackageQty = Math.max(0, Math.floor(Number(input.packageQty ?? 0) || 0));
  const normalizedLooseQty = Math.max(0, Math.floor(Number(input.looseQty ?? 0) || 0));
  const hasCompositeInput = input.packageQty !== undefined || input.looseQty !== undefined;

  if (config.packageUnit && config.packageSize) {
    if (hasCompositeInput) {
      const mergedLooseQty = normalizedPackageQty * config.packageSize + normalizedLooseQty;
      return {
        quantity: mergedLooseQty,
        packageQty: Math.floor(mergedLooseQty / config.packageSize),
        looseQty: mergedLooseQty % config.packageSize,
        packageUnit: config.packageUnit,
        packageSize: config.packageSize,
      };
    }

    const quantity = Math.max(0, Math.floor(Number(input.quantity ?? 0) || 0));
    return {
      quantity,
      packageQty: Math.floor(quantity / config.packageSize),
      looseQty: quantity % config.packageSize,
      packageUnit: config.packageUnit,
      packageSize: config.packageSize,
    };
  }

  const quantity = Math.max(0, Math.floor(Number(input.quantity ?? input.looseQty ?? 0) || 0));
  return {
    quantity,
    packageQty: null,
    looseQty: quantity,
    packageUnit: null,
    packageSize: null,
  };
}
