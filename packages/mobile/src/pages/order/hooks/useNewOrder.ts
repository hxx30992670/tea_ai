import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saleOrderApi } from '@/api/sale-order'
import { useOrderDraftStore } from '@/store/order-draft'

export interface SubmitOptions {
  autoStockOut: boolean
  autoPayment: boolean
}

export function useNewOrder() {
  const navigate = useNavigate()
  const store = useOrderDraftStore()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = useCallback(
    async ({ autoStockOut, autoPayment }: SubmitOptions) => {
      const { draft, totalAmount } = store
      if (!draft.items.length) {
        setError('请至少添加一件商品')
        return
      }

      if (!draft.method) {
        setError('请选择支付方式')
        return
      }

      setSubmitting(true)
      setError('')
      try {
        const basePayload = {
          customerId: draft.customerId,
          items: draft.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            packageQty: i.packageQty,
            looseQty: i.looseQty,
            unitPrice: i.unitPrice,
          })),
          remark: draft.remark || undefined,
        }

        if (autoStockOut && autoPayment) {
          // 建单 + 出库 + 收款
          await saleOrderApi.quickComplete({
            ...basePayload,
            paidAmount: draft.paidAmount ?? totalAmount(),
            method: draft.method,
          })
        } else if (autoStockOut && !autoPayment) {
          // 建单 + 出库，不收款
          const order = await saleOrderApi.create(basePayload)
          await saleOrderApi.stockOut(order.id)
        } else if (!autoStockOut && autoPayment) {
          // 建单 + 收款，不出库
          const order = await saleOrderApi.create(basePayload)
          await saleOrderApi.collectPayment(
            order.id,
            draft.paidAmount ?? totalAmount(),
            draft.method,
          )
        } else {
          // 仅建单
          await saleOrderApi.create(basePayload)
        }

        store.clearDraft()
        navigate('/order', { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : '提交失败')
      } finally {
        setSubmitting(false)
      }
    },
    [store, navigate],
  )

  return { submitting, error, submit }
}
