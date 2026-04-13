const QUANTITY_SCALE = 10_000;
const AMOUNT_SCALE = 100;

function toNumber(value: number | string | null | undefined) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toScaledInt(value: number | string | null | undefined, scale: number) {
  return Math.round(toNumber(value) * scale);
}

function fromScaledInt(value: number, scale: number) {
  return value / scale;
}

export function roundQuantity(value: number | string | null | undefined) {
  return fromScaledInt(toScaledInt(value, QUANTITY_SCALE), QUANTITY_SCALE);
}

export function roundAmount(value: number | string | null | undefined) {
  return fromScaledInt(toScaledInt(value, AMOUNT_SCALE), AMOUNT_SCALE);
}

export function addQuantity(...values: Array<number | string | null | undefined>) {
  const total = values.reduce<number>((sum, value) => sum + toScaledInt(value, QUANTITY_SCALE), 0);
  return fromScaledInt(total, QUANTITY_SCALE);
}

export function subtractQuantity(left: number | string | null | undefined, right: number | string | null | undefined) {
  return fromScaledInt(toScaledInt(left, QUANTITY_SCALE) - toScaledInt(right, QUANTITY_SCALE), QUANTITY_SCALE);
}

export function addAmount(...values: Array<number | string | null | undefined>) {
  const total = values.reduce<number>((sum, value) => sum + toScaledInt(value, AMOUNT_SCALE), 0);
  return fromScaledInt(total, AMOUNT_SCALE);
}

export function subtractAmount(left: number | string | null | undefined, right: number | string | null | undefined) {
  return fromScaledInt(toScaledInt(left, AMOUNT_SCALE) - toScaledInt(right, AMOUNT_SCALE), AMOUNT_SCALE);
}

export function compareQuantity(left: number | string | null | undefined, right: number | string | null | undefined) {
  return toScaledInt(left, QUANTITY_SCALE) - toScaledInt(right, QUANTITY_SCALE);
}

export function compareAmount(left: number | string | null | undefined, right: number | string | null | undefined) {
  return toScaledInt(left, AMOUNT_SCALE) - toScaledInt(right, AMOUNT_SCALE);
}

export function multiplyAmount(quantity: number | string | null | undefined, unitPrice: number | string | null | undefined) {
  const quantityInt = toScaledInt(quantity, QUANTITY_SCALE);
  const unitPriceInt = toScaledInt(unitPrice, AMOUNT_SCALE);
  return fromScaledInt(Math.round((quantityInt * unitPriceInt) / QUANTITY_SCALE), AMOUNT_SCALE);
}
