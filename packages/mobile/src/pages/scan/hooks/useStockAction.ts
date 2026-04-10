import { useCallback, useState } from 'react'
import { stockApi } from '@/api/stock'
import type { StockOperationPayload } from '@/types'

export type ActionType = 'in' | 'out'

interface UseStockActionOptions {
  onSuccess?: (type: ActionType) => void
  onError?: (msg: string) => void
}

export function useStockAction({ onSuccess, onError }: UseStockActionOptions = {}) {
  const [loading, setLoading] = useState(false)

  const submit = useCallback(
    async (type: ActionType, payload: StockOperationPayload) => {
      setLoading(true)
      try {
        if (type === 'in') {
          await stockApi.in(payload)
        } else {
          await stockApi.out(payload)
        }
        onSuccess?.(type)
      } catch (err) {
        onError?.(err instanceof Error ? err.message : '操作失败')
      } finally {
        setLoading(false)
      }
    },
    [onSuccess, onError],
  )

  return { loading, submit }
}
