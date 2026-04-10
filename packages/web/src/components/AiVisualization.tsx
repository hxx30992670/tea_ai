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

// 茶掌柜主题色板
const COLORS = ['#2D6A4F', '#52b788', '#74c69d', '#f4a261', '#e76f51', '#457b9d', '#e9c46a', '#a8dadc']

interface Props {
  rows: Record<string, unknown>[]
  spec: AiVisualizationSpec
}

// ─── 字段名 → 中文标签映射 ────────────────────────────────────────────────────
const FIELD_LABEL_MAP: Record<string, string> = {
  // 通用
  id: 'ID',
  name: '名称',
  created_at: '创建时间',
  updated_at: '更新时间',
  remark: '备注',
  status: '状态',
  // 商品
  product_id: '商品ID',
  product_name: '商品名称',
  productName: '商品名称',
  sku: 'SKU',
  barcode: '条码',
  category_id: '分类ID',
  category_name: '分类',
  categoryName: '分类',
  spec: '规格',
  unit: '单位',
  cost_price: '成本价',
  costPrice: '成本价',
  sell_price: '售价',
  sellPrice: '售价',
  stock_qty: '库存数量',
  stockQty: '库存数量',
  safe_stock: '安全库存',
  safeStock: '安全库存',
  origin: '产地',
  year: '年份',
  season: '季节',
  // 客户
  customer_id: '客户ID',
  customer_name: '客户名称',
  customerName: '客户名称',
  contact_name: '联系人',
  contactName: '联系人',
  phone: '电话',
  address: '地址',
  total_amount: '总金额',
  totalAmount: '总金额',
  receivable_amount: '应收金额',
  receivableAmount: '应收金额',
  // 供应商
  supplier_id: '供应商ID',
  supplier_name: '供应商名称',
  supplierName: '供应商名称',
  supply_category: '供货品类',
  payment_terms: '付款方式',
  // 订单通用
  order_no: '订单编号',
  orderNo: '订单编号',
  received_amount: '已收金额',
  receivedAmount: '已收金额',
  paid_amount: '已付金额',
  paidAmount: '已付金额',
  returned_amount: '退货金额',
  returnedAmount: '退货金额',
  unpaid_amount: '未付金额',
  unpaidAmount: '未付金额',
  unreceived_amount: '未收金额',
  unreceivedAmount: '未收金额',
  // 销售订单
  sale_order_id: '销售单ID',
  quantity: '数量',
  package_qty: '包装数',
  packageQty: '包装数',
  loose_qty: '散数',
  looseQty: '散数',
  package_unit: '包装单位',
  packageUnit: '包装单位',
  package_size: '每包装数量',
  packageSize: '每包装数量',
  unit_price: '单价',
  unitPrice: '单价',
  subtotal: '小计',
  cost_amount: '成本金额',
  costAmount: '成本金额',
  gross_profit: '毛利',
  grossProfit: '毛利',
  profit_rate: '毛利率',
  profitRate: '毛利率',
  // 采购订单
  purchase_order_id: '采购单ID',
  // 退货/售后
  return_no: '退货单号',
  returnNo: '退货单号',
  refund_no: '退款单号',
  refundNo: '退款单号',
  exchange_no: '换货单号',
  exchangeNo: '换货单号',
  return_amount: '退货金额',
  returnAmount: '退货金额',
  refund_amount: '退款金额',
  refundAmount: '退款金额',
  exchange_amount: '换货金额',
  exchangeAmount: '换货金额',
  receive_amount: '补收金额',
  receiveAmount: '补收金额',
  direction: '方向',
  reason_code: '原因',
  reasonCode: '原因',
  sale_exchange_out: '换货出库',
  // 商品属性（product 表字段及常用别名）
  batch_no: '批次号',
  batchNo: '批次号',
  tea_type: '茶叶类型',
  teaType: '茶叶类型',
  // 明细行计算字段（AI 生成 SQL 中按行计算的别名）
  unit_cost_price: '采购单价',
  unitCostPrice: '采购单价',
  unit_sell_price: '销售单价',
  unitSellPrice: '销售单价',
  line_total_amount: '行销售额',
  lineTotalAmount: '行销售额',
  line_cost_amount: '行成本',
  lineCostAmount: '行成本',
  line_gross_profit: '行毛利',
  lineGrossProfit: '行毛利',
  line_net_profit: '行净毛利',
  lineNetProfit: '行净毛利',
  line_profit_rate: '行毛利率',
  lineProfitRate: '行毛利率',
  // 净口径统计（AI 生成 SQL 的常用别名）
  net_sales: '净销售额',
  netSales: '净销售额',
  net_cost: '净成本',
  netCost: '净成本',
  net_profit: '净毛利',
  netProfit: '净毛利',
  net_profit_rate: '净毛利率',
  netProfitRate: '净毛利率',
  gross_profit_rate: '毛利率',
  grossProfitRate: '毛利率',
  // 销售/采购汇总
  total_sales: '总销售额',
  totalSales: '总销售额',
  total_cost: '总成本',
  totalCost: '总成本',
  total_profit: '总毛利',
  totalProfit: '总毛利',
  total_revenue: '总营业额',
  totalRevenue: '总营业额',
  avg_profit_rate: '平均毛利率',
  avgProfitRate: '平均毛利率',
  // 通用统计
  total: '合计',
  count: '数量',
  cnt: '数量',
  order_count: '订单数',
  orderCount: '订单数',
  revenue: '营业额',
  sales: '销售额',
  amount: '金额',
  avg_amount: '平均金额',
  avgAmount: '平均金额',
  total_qty: '总数量',
  totalQty: '总数量',
  supplier_count: '供应商数',
  customer_count: '客户数',
  // 库存计算字段
  available_qty: '可用库存',
  availableQty: '可用库存',
  pending_qty: '待发数量',
  pendingQty: '待发数量',
  stock_status: '库存状态',
  stockStatus: '库存状态',
  // 采购/供应商
  std_cost_price: '标准采购价',
  stdCostPrice: '标准采购价',
  payment_terms_type: '账期类型',
  paymentTermsType: '账期类型',
  payment_days: '账期天数',
  paymentDays: '账期天数',
  // 客户跟进
  follow_type: '跟进方式',
  followType: '跟进方式',
  intent_level: '意向等级',
  intentLevel: '意向等级',
  next_follow_date: '下次跟进时间',
  nextFollowDate: '下次跟进时间',
  last_content: '最近跟进内容',
  lastContent: '最近跟进内容',
  last_follow_at: '最近跟进时间',
  lastFollowAt: '最近跟进时间',
  last_follow_date: '最近跟进日期',
  lastFollowDate: '最近跟进日期',
  overdue_days: '逾期天数',
  overdueDays: '逾期天数',
  // 售后/换货
  biz_no: '业务单号',
  bizNo: '业务单号',
  biz_type: '业务类型',
  bizType: '业务类型',
  biz_amount: '业务金额',
  bizAmount: '业务金额',
  settlement_amount: '结算金额',
  settlementAmount: '结算金额',
  theoretical_difference: '理论差额',
  theoreticalDifference: '理论差额',
  difference_amount: '差额',
  differenceAmount: '差额',
  should_receive_amount: '应收差额',
  shouldReceiveAmount: '应收差额',
  row_type: '记录类型',
  rowType: '记录类型',
  // 时间/日期别名
  date: '日期',
  sale_date: '销售日期',
  saleDate: '销售日期',
  order_date: '订单日期',
  orderDate: '订单日期',
  purchase_date: '采购日期',
  purchaseDate: '采购日期',
  month: '月份',
  week: '周',
  year_month: '年月',
  day: '日期',
  orders: '订单数',
}

const CHART_REQUEST_RE = /图表|可视化|柱状图|条形图|折线图|饼图|曲线图|趋势图|对比图/

function pickPreferredNumericField(cols: string[]): string | undefined {
  const preferred = [
    'net_sales', 'netSales', 'sales', 'revenue', 'amount', 'total_amount', 'totalAmount',
    'net_profit', 'netProfit', 'gross_profit', 'grossProfit', 'profit_rate', 'profitRate',
    'order_count', 'orderCount', 'orders', 'count', 'cnt',
  ]

  return preferred.find((field) => cols.includes(field)) ?? cols[0]
}

/** 将字段名转为可读中文标签 */
export function fieldToLabel(field: string): string {
  if (FIELD_LABEL_MAP[field]) return FIELD_LABEL_MAP[field]
  // 尝试 camelCase 转 snake_case 后再查一次（如 netSales → net_sales）
  const asSnake = field.replace(/([A-Z])/g, '_$1').toLowerCase()
  if (FIELD_LABEL_MAP[asSnake]) return FIELD_LABEL_MAP[asSnake]
  // 兜底：直接返回原字段名，不做英文 Title Case 转换，让用户能看出这是一个待补充的字段
  return field
}

// ─── 自动检测可视化类型 ────────────────────────────────────────────────────────
export function detectVisualization(
  rows: Record<string, unknown>[],
  question: string,
): AiVisualizationSpec {
  if (!rows || rows.length === 0) return { type: 'none' }

  const cols = Object.keys(rows[0])
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
  })
  const dateCols = cols.filter((c) => {
    const v = String(rows[0][c] ?? '')
    return /^\d{4}-\d{2}/.test(v)
  })

  const q = question
  const isChartRequest = CHART_REQUEST_RE.test(q)
  const isProportion = /占比|百分|比例|构成|分布/.test(q) && rows.length <= 10
  const isTrend = /趋势|走势|变化|按月|每月|每周|按日|每天|月份/.test(q) && (dateCols.length > 0 || stringCols.length > 0)

  if (isChartRequest && numericCols.length >= 1) {
    const preferredYField = pickPreferredNumericField(numericCols)

    if (isProportion && stringCols.length >= 1 && preferredYField) {
      return { type: 'pie', nameField: stringCols[0], valueField: preferredYField }
    }

    const xField = dateCols[0] || stringCols[0]
    if (xField && preferredYField) {
      return { type: dateCols.length > 0 ? 'line' : 'bar', xField, yField: preferredYField }
    }
  }

  if (isProportion && numericCols.length >= 1 && stringCols.length >= 1) {
    const valueField = pickPreferredNumericField(numericCols)
    if (valueField) return { type: 'pie', nameField: stringCols[0], valueField }
  }

  if (isTrend && numericCols.length >= 1) {
    const xField = dateCols[0] || stringCols[0]
    const yField = pickPreferredNumericField(numericCols)
    if (xField && yField) return { type: 'line', xField, yField }
  }

  // 有分类列 + 数值列 → 柱状图（行数 ≤ 20）
  if (stringCols.length >= 1 && numericCols.length >= 1 && rows.length <= 20) {
    const yField = pickPreferredNumericField(numericCols)
    if (yField) return { type: 'bar', xField: stringCols[0], yField }
  }

  // 有日期列 + 数值列 → 折线图
  if (dateCols.length >= 1 && numericCols.length >= 1) {
    const yField = pickPreferredNumericField(numericCols)
    if (yField) return { type: 'line', xField: dateCols[0], yField }
  }

  // 列数多或行数多 → 表格
  if (cols.length >= 5 || rows.length > 25) return { type: 'table' }

  // 默认表格
  if (rows.length > 1 || cols.length > 2) return { type: 'table' }

  return { type: 'none' }
}

// ─── 数值格式化 ───────────────────────────────────────────────────────────────
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '-'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2)
  }
  return String(v)
}


function fmtNum(v: number) {
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)
}

// ─── 图表数据摘要说明 ─────────────────────────────────────────────────────────
function ChartSummary({ type, rows, spec }: { type: string; rows: Record<string, unknown>[]; spec: AiVisualizationSpec }) {
  if (rows.length === 0) return null

  let text = ''

  if (type === 'bar' && spec.xField && spec.yField) {
    const xLabel = fieldToLabel(spec.xField)
    const yLabel = fieldToLabel(spec.yField)
    const values = rows.map((r) => Number(r[spec.yField!]) || 0)
    const total = values.reduce((a, b) => a + b, 0)
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const maxRow = rows[values.indexOf(maxVal)]
    const minRow = rows[values.indexOf(minVal)]
    const maxName = String(maxRow?.[spec.xField] ?? '')
    const minName = String(minRow?.[spec.xField] ?? '')
    text = `共 ${rows.length} 项数据，${yLabel}合计 ${fmtNum(total)}。其中「${maxName}」最高（${fmtNum(maxVal)}），「${minName}」最低（${fmtNum(minVal)}）。`
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
    text = `${xLabel}从「${firstX}」到「${lastX}」共 ${rows.length} 个周期，${yLabel}均值 ${fmtNum(avg)}，最高 ${fmtNum(maxVal)}，最低 ${fmtNum(minVal)}，合计 ${fmtNum(total)}。`
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
    const cols = Object.keys(rows[0] ?? {})
    const colLabels = cols.map(fieldToLabel).join('、')
    // 尝试统计数值列
    const numericSummaries: string[] = []
    for (const col of cols) {
      const vals = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v) && v !== 0)
      if (vals.length === rows.length && vals.length > 1) {
        const sum = vals.reduce((a, b) => a + b, 0)
        numericSummaries.push(`${fieldToLabel(col)}合计 ${fmtNum(sum)}`)
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
  const cols = Object.keys(rows[0] ?? {})
  const columns = cols.map((c) => ({
    title: fieldToLabel(c),
    dataIndex: c,
    key: c,
    render: (v: unknown) => fmt(v),
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
