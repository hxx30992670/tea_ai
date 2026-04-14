/**
 * AI 可视化自动检测
 * 字段映射等配置从 @shared/constants/ai-field-label 导入
 */
import type { AiVisualizationSpec } from '@/types'
import {
  fieldToLabel,
  fmtNum,
  fmtQtyWithUnit,
  fmtFieldValue,
  fmtNumRaw,
  getDisplayColumns,
  isStrategySnapshotRows,
  NON_METRIC_NUMERIC_FIELDS,
  DETAIL_RECORD_FIELDS,
} from '@shared/constants/ai-field-label'

export { fieldToLabel, fmtNum, fmtQtyWithUnit, fmtFieldValue, fmtNumRaw }

const CHART_REQUEST_RE = /图表|可视化|柱状图|条形图|折线图|饼图|曲线图|趋势图|对比图/

function pickPreferredNumericField(cols: string[]): string | undefined {
  const preferred = [
    'net_sales', 'netSales', 'sales', 'revenue', 'amount', 'total_amount', 'totalAmount',
    'net_profit', 'netProfit', 'gross_profit', 'grossProfit', 'profit_rate', 'profitRate',
    'exchange_amount', 'exchangeAmount', 'return_amount', 'returnAmount', 'refund_amount', 'refundAmount',
    'quantity', 'total_qty', 'totalQty', 'available_qty', 'availableQty', 'stock_qty', 'stockQty',
    'order_count', 'orderCount', 'orders', 'count', 'cnt',
  ]
  const filtered = cols.filter((field) => !NON_METRIC_NUMERIC_FIELDS.has(field))
  return preferred.find((field) => filtered.includes(field)) ?? filtered[0]
}

export function detectVisualization(
  rows: Record<string, unknown>[],
  question: string,
): AiVisualizationSpec {
  if (!rows || rows.length === 0) return { type: 'none' }
  if (isStrategySnapshotRows(rows)) return { type: 'none' }

  const cols = getDisplayColumns(rows)
  if (cols.length === 0) return { type: 'none' }
  if (cols.length === 1 && rows.length === 1) return { type: 'none' }

  const numericCols = cols.filter((c) => {
    const v = rows[0][c]
    return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
  })
  const stringCols = cols.filter((c) => {
    const v = rows[0][c]
    return typeof v === 'string' && isNaN(Number(v))
  }).sort((a, b) => {
    const preferred = ['customer_name', 'customerName', 'supplier_name', 'supplierName', 'product_name', 'productName']
    const demoted = ['order_no', 'orderNo', 'return_no', 'returnNo', 'refund_no', 'refundNo', 'exchange_no', 'exchangeNo']
    const aIdx = preferred.includes(a) ? -1 : demoted.includes(a) ? 1 : 0
    const bIdx = preferred.includes(b) ? -1 : demoted.includes(b) ? 1 : 0
    return aIdx - bIdx
  })
  const dateCols = cols.filter((c) => /^\d{4}-\d{2}/.test(String(rows[0][c] ?? '')))

  const q = question
  const isChartRequest = CHART_REQUEST_RE.test(q)
  const isProportion = /占比|百分|比例|构成|分布/.test(q) && rows.length <= 10
  const isTrend = /趋势|走势|变化|按月|每月|每周|按日|每天|月份/.test(q) &&
    (dateCols.length > 0 || stringCols.length > 0)
  const hasDetailIdentityField = DETAIL_RECORD_FIELDS.some((field) => cols.includes(field))
  const hasPreferredMetric = Boolean(pickPreferredNumericField(numericCols))

  if (hasDetailIdentityField && !isChartRequest) {
    return { type: 'table' }
  }

  if (isChartRequest && hasPreferredMetric) {
    const preferredYField = pickPreferredNumericField(numericCols)

    if (isProportion && stringCols.length >= 1 && preferredYField) {
      return { type: 'pie', nameField: stringCols[0], valueField: preferredYField }
    }

    const xField = dateCols[0] || stringCols[0]
    if (xField && preferredYField) {
      return { type: dateCols.length > 0 ? 'line' : 'bar', xField, yField: preferredYField }
    }
  }

  if (isProportion && hasPreferredMetric && stringCols.length >= 1) {
    const valueField = pickPreferredNumericField(numericCols)
    if (valueField) return { type: 'pie', nameField: stringCols[0], valueField }
  }

  if (isTrend && hasPreferredMetric) {
    const xField = dateCols[0] || stringCols[0]
    const yField = pickPreferredNumericField(numericCols)
    if (xField && yField) return { type: 'line', xField, yField }
  }

  if (stringCols.length >= 1 && hasPreferredMetric && rows.length <= 20) {
    const yField = pickPreferredNumericField(numericCols)
    if (yField) return { type: 'bar', xField: stringCols[0], yField }
  }

  if (dateCols.length >= 1 && hasPreferredMetric) {
    const yField = pickPreferredNumericField(numericCols)
    if (yField) return { type: 'line', xField: dateCols[0], yField }
  }

  if (cols.length >= 5 || rows.length > 25) return { type: 'table' }

  if (rows.length > 1 || cols.length > 2) return { type: 'table' }

  return { type: 'none' }
}
