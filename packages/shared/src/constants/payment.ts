export const PAYMENT_METHOD_VALUES = ['现金', '微信', '支付宝', '转账', '其他'] as const

export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number]

export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_VALUES.map((method) => ({
  value: method,
  label: method,
}))

export const PAYMENT_METHOD_MAP: Record<PaymentMethod, PaymentMethod> = PAYMENT_METHOD_VALUES.reduce(
  (acc, method) => {
    acc[method] = method
    return acc
  },
  {} as Record<PaymentMethod, PaymentMethod>,
)
