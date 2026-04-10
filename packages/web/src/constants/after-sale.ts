/**
 * 售后原因枚举
 * 定义退货、换货、退款的原因选项及中文标签映射
 */

/** 售后原因代码枚举 */
export const AFTER_SALE_REASON = {
  QUALITY_ISSUE: 'quality_issue',
  TASTE_ISSUE: 'taste_issue',
  DAMAGED_PACKAGE: 'damaged_package',
  WRONG_GOODS: 'wrong_goods',
  CUSTOMER_CHANGE_MIND: 'customer_change_mind',
  PRICE_ADJUSTMENT: 'price_adjustment',
  OTHER: 'other',
} as const

export const AFTER_SALE_REASON_OPTIONS = [
  { value: AFTER_SALE_REASON.QUALITY_ISSUE, label: '质量问题' },
  { value: AFTER_SALE_REASON.TASTE_ISSUE, label: '口感不符' },
  { value: AFTER_SALE_REASON.DAMAGED_PACKAGE, label: '包装破损' },
  { value: AFTER_SALE_REASON.WRONG_GOODS, label: '发错货' },
  { value: AFTER_SALE_REASON.CUSTOMER_CHANGE_MIND, label: '顾客改主意' },
  { value: AFTER_SALE_REASON.PRICE_ADJUSTMENT, label: '补差价/仅退款' },
  { value: AFTER_SALE_REASON.OTHER, label: '其他' },
] as const

export const AFTER_SALE_REASON_LABELS = Object.fromEntries(
  AFTER_SALE_REASON_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

export type AfterSaleReasonCode = (typeof AFTER_SALE_REASON)[keyof typeof AFTER_SALE_REASON]
