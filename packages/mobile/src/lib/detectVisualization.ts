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
const COMPARISON_REQUEST_RE = /对比|比较|比一比|和.+比|相比|相较|排名|排行|名次|领先|落后|高低|头部|梯队|其它茶|其他茶/
const QUANTITY_REQUEST_RE = /销量|卖了多少|卖出|总量|数量|多少斤|多少两|多少饼|多少盒|多少提|多少件|动销|出货量/
const ORDER_COUNT_REQUEST_RE = /订单数|单量|多少单|几单/
const AMOUNT_REQUEST_RE = /销售额|销售金额|营收|营业额|收入|成交额|金额|gmv/i
const DERIVED_CATEGORY_FIELD = '__viz_category__'

function pickPreferredNumericField(cols: string[], question = ''): string | undefined {
  const amountPreferred = [
    'net_sales', 'netSales', 'sales', 'revenue', 'amount', 'total_amount', 'totalAmount',
    'net_profit', 'netProfit', 'gross_profit', 'grossProfit', 'profit_rate', 'profitRate',
    'total_qty', 'totalQty', 'quantity', 'available_qty', 'availableQty', 'stock_qty', 'stockQty',
    'order_count', 'orderCount', 'orders', 'count', 'cnt',
  ]
  const quantityPreferred = [
    'total_qty', 'totalQty', 'quantity', 'available_qty', 'availableQty', 'stock_qty', 'stockQty',
    'order_count', 'orderCount', 'orders', 'count', 'cnt',
    'net_sales', 'netSales', 'sales', 'revenue', 'amount', 'total_amount', 'totalAmount',
    'net_profit', 'netProfit', 'gross_profit', 'grossProfit', 'profit_rate', 'profitRate',
  ]
  const orderPreferred = [
    'order_count', 'orderCount', 'orders', 'count', 'cnt',
    'total_qty', 'totalQty', 'quantity',
    'net_sales', 'netSales', 'sales', 'revenue', 'amount', 'total_amount', 'totalAmount',
    'net_profit', 'netProfit', 'gross_profit', 'grossProfit', 'profit_rate', 'profitRate',
  ]
  const fallbackPreferred = [
    'net_sales', 'netSales', 'sales', 'revenue', 'amount', 'total_amount', 'totalAmount',
    'net_profit', 'netProfit', 'gross_profit', 'grossProfit', 'profit_rate', 'profitRate',
    'exchange_amount', 'exchangeAmount', 'return_amount', 'returnAmount', 'refund_amount', 'refundAmount',
    'quantity', 'total_qty', 'totalQty', 'available_qty', 'availableQty', 'stock_qty', 'stockQty',
    'order_count', 'orderCount', 'orders', 'count', 'cnt',
  ]
  const filtered = cols.filter((field) => !NON_METRIC_NUMERIC_FIELDS.has(field))
  if (filtered.length === 0) return undefined

  const normalizedQuestion = question.trim()
  const preferred = ORDER_COUNT_REQUEST_RE.test(normalizedQuestion)
    ? orderPreferred
    : QUANTITY_REQUEST_RE.test(normalizedQuestion) && !AMOUNT_REQUEST_RE.test(normalizedQuestion)
      ? quantityPreferred
      : AMOUNT_REQUEST_RE.test(normalizedQuestion)
        ? amountPreferred
        : fallbackPreferred

  return preferred.find((field) => filtered.includes(field)) ?? filtered[0]
}

function getTextValue(row: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = row[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

function getDuplicateProductNames(rows: Record<string, unknown>[]) {
  const countMap = new Map<string, number>()

  rows.forEach((row) => {
    const productName = getTextValue(row, ['product_name', 'productName', 'name'])
    if (!productName) return
    countMap.set(productName, (countMap.get(productName) ?? 0) + 1)
  })

  return new Set(
    [...countMap.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  )
}

function resolveCategoryField(rows: Record<string, unknown>[], stringCols: string[]) {
  const preferredField = stringCols[0]
  if (!preferredField) return undefined

  if (['product_name', 'productName', 'name'].includes(preferredField) && getDuplicateProductNames(rows).size > 0) {
    return DERIVED_CATEGORY_FIELD
  }

  return preferredField
}

function buildDerivedCategoryLabel(row: Record<string, unknown>, duplicateProductNames: Set<string>) {
  const productName = getTextValue(row, ['product_name', 'productName', 'name'])
  if (!productName) return '-'
  if (!duplicateProductNames.has(productName)) return productName

  const spec = getTextValue(row, ['spec'])
  const year = row.year
  const yearText = typeof year === 'number' && Number.isFinite(year)
    ? `${year}年`
    : (typeof year === 'string' && year.trim() ? `${year.trim()}年` : '')
  const extraParts = [spec, yearText].filter(Boolean)

  return extraParts.length > 0 ? `${productName}（${extraParts.join('·')}）` : productName
}

export function prepareVisualizationRows(
  rows: Record<string, unknown>[],
  xField: string,
  yField?: string,
) {
  const duplicateProductNames = xField === DERIVED_CATEGORY_FIELD ? getDuplicateProductNames(rows) : new Set<string>()

  return rows.map((row) => ({
    ...row,
    [xField]: xField === DERIVED_CATEGORY_FIELD
      ? buildDerivedCategoryLabel(row, duplicateProductNames)
      : String(row[xField] ?? ''),
    ...(yField ? { [yField]: Number(row[yField]) || 0 } : {}),
  }))
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
  const isComparison = COMPARISON_REQUEST_RE.test(q) && rows.length > 1
  const isProportion = /占比|百分|比例|构成|分布/.test(q) && rows.length <= 10
  const isTrend = /趋势|走势|变化|按月|每月|每周|按日|每天|月份/.test(q) &&
    (dateCols.length > 0 || stringCols.length > 0)
  const hasDetailIdentityField = DETAIL_RECORD_FIELDS.some((field) => cols.includes(field))
  const preferredMetric = pickPreferredNumericField(numericCols, q)
  const hasPreferredMetric = Boolean(preferredMetric)

  if (isComparison && preferredMetric) {
    const xField = resolveCategoryField(rows, stringCols)
    if (xField) {
      return { type: 'bar', xField, yField: preferredMetric }
    }
  }

  if (hasDetailIdentityField && !isChartRequest) {
    return { type: 'table' }
  }

  if (isChartRequest && hasPreferredMetric) {
    const preferredYField = preferredMetric

    if (isProportion && stringCols.length >= 1 && preferredYField) {
      return { type: 'pie', nameField: resolveCategoryField(rows, stringCols) ?? stringCols[0], valueField: preferredYField }
    }

    const xField = dateCols[0] || resolveCategoryField(rows, stringCols)
    if (xField && preferredYField) {
      return { type: dateCols.length > 0 ? 'line' : 'bar', xField, yField: preferredYField }
    }
  }

  if (isProportion && hasPreferredMetric && stringCols.length >= 1) {
    const valueField = preferredMetric
    if (valueField) return { type: 'pie', nameField: stringCols[0], valueField }
  }

  if (isTrend && hasPreferredMetric) {
    const xField = dateCols[0] || resolveCategoryField(rows, stringCols)
    const yField = preferredMetric
    if (xField && yField) return { type: 'line', xField, yField }
  }

  if (stringCols.length >= 1 && hasPreferredMetric && rows.length <= 20) {
    const yField = preferredMetric
    if (yField) return { type: 'bar', xField: resolveCategoryField(rows, stringCols) ?? stringCols[0], yField }
  }

  if (dateCols.length >= 1 && hasPreferredMetric) {
    const yField = preferredMetric
    if (yField) return { type: 'line', xField: dateCols[0], yField }
  }

  if (cols.length >= 5 || rows.length > 25) return { type: 'table' }

  if (rows.length > 1 || cols.length > 2) return { type: 'table' }

  return { type: 'none' }
}
