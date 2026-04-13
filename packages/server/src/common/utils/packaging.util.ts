import { ProductEntity } from '../../entities/product.entity';
import { addQuantity, roundQuantity } from './precision.util';

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
  const normalizedPackageQty = Math.max(0, roundQuantity(input.packageQty ?? 0));
  const normalizedLooseQty = Math.max(0, roundQuantity(input.looseQty ?? 0));
  const hasCompositeInput = input.packageQty !== undefined || input.looseQty !== undefined;

  if (config.packageUnit && config.packageSize) {
    if (hasCompositeInput) {
      const mergedLooseQty = addQuantity(normalizedPackageQty * config.packageSize, normalizedLooseQty);
      return {
        quantity: mergedLooseQty,
        packageQty: normalizedPackageQty,
        looseQty: normalizedLooseQty,
        packageUnit: config.packageUnit,
        packageSize: config.packageSize,
      };
    }

    const quantity = Math.max(0, roundQuantity(input.quantity ?? 0));
    return {
      quantity,
      packageQty: 0,
      looseQty: quantity,
      packageUnit: config.packageUnit,
      packageSize: config.packageSize,
    };
  }

  const quantity = Math.max(0, roundQuantity(input.quantity ?? input.looseQty ?? 0));
  return {
    quantity,
    packageQty: null,
    looseQty: quantity,
    packageUnit: null,
    packageSize: null,
  };
}
