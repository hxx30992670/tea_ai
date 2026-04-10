/**
 * 订单状态及收付款类型常量
 * 定义采购订单、销售订单的状态流转及收付款记录类型
 */

/** 采购订单状态枚举 */
export const PURCHASE_ORDER_STATUS = {
  DRAFT: 'draft',
  STOCKED: 'stocked',
  DONE: 'done',
  RETURNED: 'returned',
} as const

export const SALE_ORDER_STATUS = {
  DRAFT: 'draft',
  SHIPPED: 'shipped',
  DONE: 'done',
  RETURNED: 'returned',
} as const

export const PAYMENT_RECORD_TYPE = {
  RECEIVE: 'receive',
  PAY: 'pay',
  REFUND: 'refund',
  SUPPLIER_REFUND: 'supplier_refund',
} as const

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUS)[keyof typeof PURCHASE_ORDER_STATUS]
export type SaleOrderStatus = (typeof SALE_ORDER_STATUS)[keyof typeof SALE_ORDER_STATUS]
export type PaymentRecordType = (typeof PAYMENT_RECORD_TYPE)[keyof typeof PAYMENT_RECORD_TYPE]
