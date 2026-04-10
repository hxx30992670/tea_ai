import { useState } from 'react'
import { saleOrderApi } from '@/api/sale-order'

export function useOrderActions(onSuccess: () => void) {
  const [stockingOutId, setStockingOutId] = useState<number | null>(null)
  const [collectingId, setCollectingId] = useState<number | null>(null)

  const doStockOut = async (id: number) => {
    setStockingOutId(id)
    try {
      await saleOrderApi.stockOut(id)
      onSuccess()
    } finally {
      setStockingOutId(null)
    }
  }

  const doCollect = async (id: number, amount: number) => {
    setCollectingId(id)
    try {
      await saleOrderApi.collectPayment(id, amount, '现金')
      onSuccess()
    } finally {
      setCollectingId(null)
    }
  }

  return {
    doStockOut,
    doCollect,
    stockingOutId,
    collectingId,
  }
}
