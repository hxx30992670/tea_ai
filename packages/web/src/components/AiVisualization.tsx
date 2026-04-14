/**
 * AI 数据可视化组件
 * 根据 AI 返回的查询结果及可视化规格，自动渲染表格或图表（柱状图/折线图/饼图）
 * 使用茶掌柜主题色板，保持整体视觉一致性
 */
import React from 'react'
import { Table } from 'antd'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { AiVisualizationSpec } from '@/types'
import {
  fieldToLabel,
  fmtFieldValue,
  fmtNum,
  fmtQtyWithUnit,
  getDisplayColumns,
  isStrategySnapshotRows,
  isSummarizableMetricField,
  NON_METRIC_NUMERIC_FIELDS,
  DETAIL_RECORD_FIELDS,
} from '@shared/constants/ai-field-label'

const COLORS = ['#2D6A4F', '#52b788', '#74c69d', '#f4a261', '#e76f51', '#457b9d', '#e9c46a', '#a8dadc']

interface Props {
  rows: Record<string, unknown>[]
  spec: AiVisualizationSpec
}

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

// ─── 自动检测可视化类型 ────────────────────────────────────────────────────────
export function detectVisualization(
  rows: Record<string, unknown>[],
  question: string,
): AiVisualizationSpec {
  if (!rows || rows.length === 0) return { type: 'none' }

  if (isStrategySnapshotRows(rows)) return { type: 'none' }

  const cols = getDisplayColumns(rows)
  if (cols.length === 0) return { type: 'none' }

  // 单值结果 → 纯文字即可
  if (cols.length === 1 && rows.length === 1) return { type: 'none' }

  // 分析列类型
  const numericCols = cols.filter((c) => {
    const v = rows[0][c]
    return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
  })
  const stringCols = cols.filter((c) => {
    const v = rows[0][c]
    return typeof v === 'string' && isNaN(Number(v))
  }).sort((a, b) => {
    // 优先用客户名/供应商名作为图表标签，而非订单号
    const preferred = ['customer_name', 'customerName', 'supplier_name', 'supplierName', 'product_name', 'productName']
    const demoted = ['order_no', 'orderNo', 'return_no', 'returnNo', 'refund_no', 'refundNo', 'exchange_no', 'exchangeNo']
    const aIdx = preferred.includes(a) ? -1 : demoted.includes(a) ? 1 : 0
    const bIdx = preferred.includes(b) ? -1 : demoted.includes(b) ? 1 : 0
    return aIdx - bIdx
  })
  const dateCols = cols.filter((c) => {
    const v = String(rows[0][c] ?? '')
    return /^\d{4}-\d{2}/.test(v)
  })

  const q = question
  const isChartRequest = CHART_REQUEST_RE.test(q)
  const isProportion = /占比|百分|比例|构成|分布/.test(q) && rows.length <= 10
  const isTrend = /趋势|走势|变化|按月|每月|每周|按日|每天|月份/.test(q) && (dateCols.length > 0 || stringCols.length > 0)
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

  // 有分类列 + 数值列 → 柱状图（行数 ≤ 20）
  if (stringCols.length >= 1 && hasPreferredMetric && rows.length <= 20) {
    const yField = pickPreferredNumericField(numericCols)
    if (yField) return { type: 'bar', xField: stringCols[0], yField }
  }

  // 有日期列 + 数值列 → 折线图
  if (dateCols.length >= 1 && hasPreferredMetric) {
    const yField = pickPreferredNumericField(numericCols)
    if (yField) return { type: 'line', xField: dateCols[0], yField }
  }

  // 列数多或行数多 → 表格
  if (cols.length >= 5 || rows.length > 25) return { type: 'table' }

  // 默认表格
  if (rows.length > 1 || cols.length > 2) return { type: 'table' }

  return { type: 'none' }
}

// ─── 图表数据摘要说明 ─────────────────────────────────────────────────────────
function ChartSummary({ type, rows, spec }: { type: string; rows: Record<string, unknown>[]; spec: AiVisualizationSpec }) {
  if (rows.length === 0) return null

  let text = ''

  if (type === 'bar' && spec.xField && spec.yField) {
    const yLabel = fieldToLabel(spec.yField)
    const values = rows.map((r) => Number(r[spec.yField!]) || 0)
    const total = values.reduce((a, b) => a + b, 0)
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const maxIdx = values.indexOf(maxVal)
    const minIdx = values.indexOf(minVal)
    const maxRow = rows[maxIdx]
    const minRow = rows[minIdx]
    const maxName = String(maxRow?.[spec.xField] ?? '')
    const minName = String(minRow?.[spec.xField] ?? '')
    const fmtTotal = fmtQtyWithUnit(total, spec.yField, rows[0], rows)
    const fmtMax = fmtQtyWithUnit(maxVal, spec.yField, maxRow, rows)
    const fmtMin = fmtQtyWithUnit(minVal, spec.yField, minRow, rows)
    text = `共 ${rows.length} 项数据，${yLabel}合计 ${fmtTotal}。其中「${maxName}」最高（${fmtMax}），「${minName}」最低（${fmtMin}）。`
  }

  if (type === 'line' && spec.xField && spec.yField) {
    const xLabel = fieldToLabel(spec.xField)
    const yLabel = fieldToLabel(spec.yField)
    const values = rows.map((r) => Number(r[spec.yField!]) || 0)
    const total = values.reduce((a, b) => a + b, 0)
    const avg = total / values.length
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const firstX = String(rows[0]?.[spec.xField] ?? '')
    const lastX = String(rows[rows.length - 1]?.[spec.xField] ?? '')
    const fmtAvg = fmtQtyWithUnit(avg, spec.yField, rows[0], rows)
    const fmtMax = fmtQtyWithUnit(maxVal, spec.yField, rows[0], rows)
    const fmtMin = fmtQtyWithUnit(minVal, spec.yField, rows[0], rows)
    const fmtTotal = fmtQtyWithUnit(total, spec.yField, rows[0], rows)
    text = `${xLabel}从「${firstX}」到「${lastX}」共 ${rows.length} 个周期，${yLabel}均值 ${fmtAvg}，最高 ${fmtMax}，最低 ${fmtMin}，合计 ${fmtTotal}。`
  }

  if (type === 'pie' && spec.nameField && spec.valueField) {
    const yLabel = fieldToLabel(spec.valueField)
    const data = rows
      .map((r) => ({ name: String(r[spec.nameField!] ?? ''), value: Number(r[spec.valueField!]) || 0 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
    const total = data.reduce((s, d) => s + d.value, 0)
    const top = data[0]
    const topPct = total > 0 ? ((top.value / total) * 100).toFixed(1) : '0'
    const parts = data.slice(0, 3).map((d) => `「${d.name}」占 ${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`).join('，')
    text = `共 ${data.length} 个分类，${yLabel}合计 ${fmtNum(total)}。排名前三：${parts}。占比最大的是「${top.name}」（${topPct}%）。`
  }

  if (type === 'table') {
    const cols = getDisplayColumns(rows)
    const colLabels = cols.map(fieldToLabel).join('、')
    // 尝试统计数值列
    const numericSummaries: string[] = []
    for (const col of cols) {
      const rawValues = rows.map((r) => r[col])
      if (isSummarizableMetricField(col, rawValues)) {
        const vals = rawValues.map((value) => Number(value)).filter((v) => !isNaN(v) && v !== 0)
        const sum = vals.reduce((a, b) => a + b, 0)
        numericSummaries.push(`${fieldToLabel(col)}合计 ${fmtQtyWithUnit(sum, col, rows[0], rows)}`)
      }
    }
    text = `共 ${rows.length} 条记录，包含字段：${colLabels}。${numericSummaries.length > 0 ? numericSummaries.join('，') + '。' : ''}`
  }

  if (!text) return null

  return (
    <div style={{
      marginTop: 10,
      padding: '8px 12px',
      background: '#f6fbf8',
      borderRadius: 6,
      borderLeft: '3px solid #52b788',
      fontSize: 12,
      color: '#444',
      lineHeight: 1.7,
    }}>
      📊 {text}
    </div>
  )
}

// ─── 表格 ─────────────────────────────────────────────────────────────────────
function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = getDisplayColumns(rows)
  const columns = cols.map((c) => ({
    title: fieldToLabel(c),
    dataIndex: c,
    key: c,
    render: (v: unknown) => fmtFieldValue(c, v),
    ellipsis: true,
  }))
  return (
    <Table
      size="small"
      columns={columns}
      dataSource={rows.map((r, i) => ({ ...r, _key: i }))}
      rowKey="_key"
      pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false}
      scroll={{ x: true }}
      style={{ marginTop: 12 }}
    />
  )
}

// ─── Tooltip 格式化（value + name 都转中文）────────────────────────────────────
function tooltipFormatter(value: number | string, name: string): [number | string, string] {
  const displayValue = typeof value === 'number'
    ? (Number.isInteger(value) ? value : Number(value.toFixed(2)))
    : value
  return [displayValue, fieldToLabel(name)]
}

// ─── 柱状图 ───────────────────────────────────────────────────────────────────
function BarViz({ rows, xField, yField }: { rows: Record<string, unknown>[]; xField: string; yField: string }) {
  const data = rows.map((r) => ({ ...r, [yField]: Number(r[yField]) || 0 }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xField} tick={{ fontSize: 12 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={tooltipFormatter} />
        <Bar dataKey={yField} name={fieldToLabel(yField)} fill="#2D6A4F" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 折线图 ───────────────────────────────────────────────────────────────────
function LineViz({ rows, xField, yField }: { rows: Record<string, unknown>[]; xField: string; yField: string }) {
  const data = rows.map((r) => ({ ...r, [yField]: Number(r[yField]) || 0 }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xField} tick={{ fontSize: 12 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={tooltipFormatter} />
        <Line type="monotone" dataKey={yField} name={fieldToLabel(yField)} stroke="#2D6A4F" strokeWidth={2} dot={{ r: 4, fill: '#2D6A4F' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── 饼图 ─────────────────────────────────────────────────────────────────────
function PieViz({ rows, nameField, valueField }: { rows: Record<string, unknown>[]; nameField: string; valueField: string }) {
  const data = rows
    .map((r) => ({ name: String(r[nameField] ?? ''), value: Number(r[valueField]) || 0 }))
    .filter((d) => d.value > 0)

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={90}
          dataKey="value"
          label={({ name, value }) => `${name} ${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%`}
          labelLine
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number, name: string) => [fmtNum(v), name]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function AiVisualization({ rows, spec }: Props) {
  if (!rows || rows.length === 0 || spec.type === 'none') return null

  return (
    <div style={{
      marginTop: 12,
      padding: '12px 16px',
      background: '#fff',
      borderRadius: 8,
      border: '1px solid #f0f0f0',
    }}>
      {spec.type === 'table' && <DataTable rows={rows} />}

      {spec.type === 'bar' && spec.xField && spec.yField && (
        <BarViz rows={rows} xField={spec.xField} yField={spec.yField} />
      )}

      {spec.type === 'line' && spec.xField && spec.yField && (
        <LineViz rows={rows} xField={spec.xField} yField={spec.yField} />
      )}

      {spec.type === 'pie' && spec.nameField && spec.valueField && (
        <PieViz rows={rows} nameField={spec.nameField} valueField={spec.valueField} />
      )}

      <ChartSummary type={spec.type} rows={rows} spec={spec} />

      <div style={{ textAlign: 'right', marginTop: 6, fontSize: 11, color: '#bbb' }}>
        共 {rows.length} 条数据
      </div>
    </div>
  )
}
