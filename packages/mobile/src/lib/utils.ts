import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function roundQuantity(value: number | undefined | null, precision = 4): number {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return 0
  const factor = 10 ** precision
  return Math.round(num * factor) / factor
}

export function roundAmount(value: number | undefined | null, precision = 2): number {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return 0
  const factor = 10 ** precision
  return Math.round(num * factor) / factor
}

export function parseDecimal(value: string | number | undefined | null, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(num) ? num : fallback
}

export function formatNumber(value: number | undefined | null, precision = 4): string {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return '0'
  return String(Number(num.toFixed(precision)))
}

/** 格式化金额，带千分符 */
export function formatMoney(amount: number | undefined | null, decimals = 2): string {
  const num = amount ?? 0
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/** 格式化简短金额（万元） */
export function formatMoneyShort(amount: number): string {
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(1)}万`
  }
  return formatMoney(amount, 0)
}

/** 格式化日期 */
export function formatDate(date: string | Date, fmt = 'YYYY-MM-DD'): string {
  const d = typeof date === 'string' ? parseUTCDate(date) : date
  const pad = (n: number) => String(n).padStart(2, '0')
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm/g, (m) => map[m] ?? m)
}

/** 相对时间 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseUTCDate(date) : date
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`
  return formatDate(d, 'MM-DD')
}

/** 解析 UTC 时间字符串为本地时间 Date 对象 */
function parseUTCDate(dateStr: string): Date {
  const trimmed = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(trimmed)
  }
  if (trimmed.includes('T') || trimmed.includes('Z')) {
    return new Date(trimmed)
  }
  return new Date(trimmed.replace(' ', 'T') + 'Z')
}

/**
 * 销售订单状态（与 server 端 SALE_ORDER_STATUS 对齐）
 * draft → shipped → done / returned
 */
export const SALE_ORDER_STATUS = {
  DRAFT: 'draft',
  SHIPPED: 'shipped',
  DONE: 'done',
  RETURNED: 'returned',
} as const

export const SALE_ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'text-muted-foreground' },
  shipped: { label: '已出货', color: 'text-blue-400' },
  done: { label: '已完成', color: 'text-green-400' },
  returned: { label: '已退完', color: 'text-red-400' },
}

/** 采购订单状态 */
export const PURCHASE_ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'text-muted-foreground' },
  stocked: { label: '已入库', color: 'text-blue-400' },
  done: { label: '已完成', color: 'text-green-400' },
  returned: { label: '已退完', color: 'text-red-400' },
}

/** 支付方式 */
export const PAYMENT_METHODS = [
  ...PAYMENT_METHOD_OPTIONS,
] as const

export const PAYMENT_METHOD_MAP: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
)

/** 入库原因 */
export const STOCK_IN_REASONS = [
  { value: 'opening', label: '期初建账' },
  { value: 'surplus', label: '盘盈入库' },
  { value: 'other', label: '其他入库' },
] as const

/** 出库原因 */
export const STOCK_OUT_REASONS = [
  { value: 'damage', label: '报损出库' },
  { value: 'usage', label: '内部领用' },
  { value: 'shortage', label: '盘亏出库' },
  { value: 'other', label: '其他出库' },
] as const

/** 售后原因 */
export const AFTER_SALE_REASONS = [
  { value: 'quality_issue', label: '质量问题' },
  { value: 'taste_issue', label: '口感不符' },
  { value: 'damaged_package', label: '包装破损' },
  { value: 'wrong_goods', label: '发错货' },
  { value: 'customer_change_mind', label: '顾客改主意' },
  { value: 'price_adjustment', label: '补差价/仅退款' },
  { value: 'other', label: '其他' },
] as const

/**
 * 计算商品实际数量（基准单位）
 * 茶批发支持 packageQty（件数）+ looseQty（散装），合并成总 quantity
 */
export function calcTotalQuantity(
  packageQty: number | undefined,
  looseQty: number | undefined,
  packageSize: number | undefined,
): number {
  return roundQuantity(((packageQty ?? 0) * (packageSize ?? 1)) + (looseQty ?? 0))
}

/**
 * 格式化数量显示（例如 "2件 + 3斤" 或 "50斤"）
 */
export function formatQuantity(
  quantity: number | undefined,
  packageQty: number | undefined,
  looseQty: number | undefined,
  unit?: string,
  packageUnit?: string,
): string {
  const parts: string[] = []
  if (packageQty && packageQty > 0) {
    parts.push(`${formatNumber(packageQty)}${packageUnit || '件'}`)
  }
  if (looseQty && looseQty > 0) {
    parts.push(`${formatNumber(looseQty)}${unit || ''}`)
  }
  if (parts.length) return parts.join(' + ')
  if (quantity != null) return `${formatNumber(quantity)}${unit || ''}`
  return '—'
}
