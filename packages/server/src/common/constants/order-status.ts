export const PURCHASE_ORDER_STATUS = {
  DRAFT: 'draft',
  STOCKED: 'stocked',
  DONE: 'done',
  RETURNED: 'returned',
} as const;

export const SALE_ORDER_STATUS = {
  DRAFT: 'draft',
  SHIPPED: 'shipped',
  DONE: 'done',
  RETURNED: 'returned',
} as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUS)[keyof typeof PURCHASE_ORDER_STATUS];
export type SaleOrderStatus = (typeof SALE_ORDER_STATUS)[keyof typeof SALE_ORDER_STATUS];

export const PAYMENT_RECORD_TYPE = {
  RECEIVE: 'receive',
  PAY: 'pay',
  REFUND: 'refund',
  SUPPLIER_REFUND: 'supplier_refund',
} as const;

export const SALE_EXCHANGE_STATUS = {
  DRAFT: 'draft',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type SaleExchangeStatus = (typeof SALE_EXCHANGE_STATUS)[keyof typeof SALE_EXCHANGE_STATUS];

export const PAYMENT_METHOD_VALUES = ['现金', '微信', '支付宝', '转账', '其他'] as const;

export type PaymentRecordType = (typeof PAYMENT_RECORD_TYPE)[keyof typeof PAYMENT_RECORD_TYPE];
export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];
