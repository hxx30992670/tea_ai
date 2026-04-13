/**
 * 开单草稿 Store
 * 持久化到 localStorage，防止用户中途接电话后数据丢失
 *
 * 数量模型：茶批发支持 packageQty（件/包）+ looseQty（散装）
 * 如果商品有 packageSize，则 quantity = packageQty * packageSize + looseQty
 */
import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

const roundQuantity = (value: number) => Math.round(value * 10000) / 10000
const roundAmount = (value: number) => Math.round(value * 100) / 100
const calcItemQuantity = (item: Pick<DraftItem, 'quantity' | 'packageQty' | 'looseQty' | 'packageSize'>) => roundQuantity(item.quantity ?? ((item.packageQty ?? 0) * (item.packageSize ?? 1) + (item.looseQty ?? 0)))

export interface DraftItem {
  productId: number
  productName: string
  spec?: string
  unit?: string
  packageUnit?: string
  packageSize?: number
  /** 总数量（基准单位） */
  quantity?: number
  /** 包装数量（如：1件） */
  packageQty?: number
  /** 散数量（如：3斤） */
  looseQty?: number
  unitPrice: number
  /** 商品登记售价（参考价，用于对比加价/降价） */
  sellPrice?: number
}

export interface OrderDraft {
  customerId?: number
  customerName?: string
  customerPhone?: string
  items: DraftItem[]
  /** 支付方式（现金/微信/支付宝/转账/其他） */
  method: string
  remark: string
  paidAmount?: number
}

interface OrderDraftState {
  draft: OrderDraft
  isDirty: boolean

  setCustomer: (customer: { id?: number; name: string; phone?: string }) => void
  addItem: (item: DraftItem) => void
  updateItem: (productId: number, patch: Partial<DraftItem>) => void
  removeItem: (productId: number) => void
  setMethod: (method: string) => void
  setRemark: (remark: string) => void
  setPaidAmount: (amount: number | undefined) => void
  adjustPricesByPaidAmount: (paidAmount: number) => void
  clearDraft: () => void
  totalAmount: () => number
}

const EMPTY_DRAFT: OrderDraft = {
  items: [],
  method: '现金',
  remark: '',
}

export const useOrderDraftStore = create<OrderDraftState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
      draft: EMPTY_DRAFT,
      isDirty: false,

      setCustomer: ({ id, name, phone }) =>
        set((s) => ({
          draft: { ...s.draft, customerId: id, customerName: name, customerPhone: phone },
          isDirty: true,
        })),

      addItem: (item) =>
        set((s) => {
          const existing = s.draft.items.find((i) => i.productId === item.productId)
          const items = existing
            ? s.draft.items.map((i) =>
                i.productId === item.productId
                  ? {
                      ...i,
                      packageQty: roundQuantity((i.packageQty ?? 0) + (item.packageQty ?? 0)),
                      looseQty: roundQuantity((i.looseQty ?? 0) + (item.looseQty ?? 0)),
                      quantity: roundQuantity((i.quantity ?? 0) + (item.quantity ?? 0)),
                    }
                  : i,
              )
            : [...s.draft.items, item]
          return { draft: { ...s.draft, items }, isDirty: true }
        }),

      updateItem: (productId, patch) =>
        set((s) => ({
          draft: {
            ...s.draft,
            items: s.draft.items.map((i) => (i.productId === productId ? { ...i, ...patch } : i)),
          },
          isDirty: true,
        })),

      removeItem: (productId) =>
        set((s) => ({
          draft: {
            ...s.draft,
            items: s.draft.items.filter((i) => i.productId !== productId),
          },
          isDirty: true,
        })),

      setMethod: (method) =>
        set((s) => ({ draft: { ...s.draft, method }, isDirty: true })),

      setRemark: (remark) =>
        set((s) => ({ draft: { ...s.draft, remark }, isDirty: true })),

      setPaidAmount: (amount) =>
        set((s) => ({ draft: { ...s.draft, paidAmount: amount }, isDirty: true })),

      adjustPricesByPaidAmount: (paidAmount) =>
        set((s) => {
          const originalTotal = get().totalAmount()
          if (originalTotal <= 0 || s.draft.items.length === 0) {
            return { draft: { ...s.draft, paidAmount: roundAmount(paidAmount) }, isDirty: true }
          }

          const normalizedPaidAmount = roundAmount(paidAmount)
          const ratio = normalizedPaidAmount / originalTotal
          const itemsCount = s.draft.items.length

          const adjustedItems = s.draft.items.map((item, index) => {
            const qty = calcItemQuantity(item)
            let adjustedPrice = roundAmount(item.unitPrice * ratio)

            if (index === itemsCount - 1) {
              const prevTotal = s.draft.items.slice(0, index).reduce((sum, i) => {
                const q = calcItemQuantity(i)
                const adjPrice = roundAmount(i.unitPrice * ratio)
                return roundAmount(sum + roundAmount(q * adjPrice))
              }, 0)
              const lastItemTotal = roundAmount(normalizedPaidAmount - prevTotal)
              adjustedPrice = qty > 0 ? roundAmount(lastItemTotal / qty) : 0
            }

            return {
              ...item,
              unitPrice: adjustedPrice,
            }
          })

          return {
            draft: { ...s.draft, items: adjustedItems, paidAmount: normalizedPaidAmount },
            isDirty: true,
          }
        }),

      clearDraft: () => set({ draft: EMPTY_DRAFT, isDirty: false }),

      totalAmount: () =>
        get().draft.items.reduce((sum, i) => roundAmount(sum + roundAmount(calcItemQuantity(i) * i.unitPrice)), 0),
    }),
    {
      name: 'tea-order-draft',
      partialize: (state) => ({ draft: state.draft }),
    },
  ),
),
)
