import type { ReactNode } from 'react'
import type { StockBatch } from '@/types'
import { formatQuantityNumber } from '@/utils/packaging'

type BatchOptionSource = Pick<
  StockBatch,
  'id' | 'batchNo' | 'productName' | 'warehouseName' | 'locationName' | 'quantity' | 'unit'
>

interface BatchSelectOptionConfig {
  showProductName?: boolean
}

export interface BatchSelectOptionData {
  value: number
  label: string
  searchText: string
  batch: BatchOptionSource
  showProductName?: boolean
}

export function makeBatchSelectOption(batch: BatchOptionSource, config: BatchSelectOptionConfig = {}): BatchSelectOptionData {
  return {
    value: batch.id,
    label: batch.batchNo,
    searchText: [
      batch.productName,
      batch.batchNo,
      batch.warehouseName,
      batch.locationName,
      batch.quantity,
      batch.unit,
    ].filter(Boolean).join(' '),
    batch,
    showProductName: config.showProductName,
  }
}

export function filterBatchSelectOption(input: string, option?: BatchSelectOptionData) {
  return String(option?.searchText ?? '').toLowerCase().includes(input.toLowerCase())
}

export function renderBatchSelectOption(option: { data?: unknown }): ReactNode {
  const data = option.data as BatchSelectOptionData
  const batch = data.batch
  return (
    <div style={{ lineHeight: 1.4 }}>
      <div style={{ fontWeight: 500 }}>
        {data.showProductName && batch.productName ? `${batch.productName}｜` : ''}
        {batch.batchNo}
      </div>
      <div style={{ fontSize: 12, color: '#888' }}>
        {batch.warehouseName}/{batch.locationName ?? '-'} · {formatQuantityNumber(batch.quantity)}{batch.unit ?? ''}
      </div>
    </div>
  )
}
