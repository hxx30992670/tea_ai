/**
 * AI 可视化自动检测 & 字段名中文映射
 * 与 packages/web/src/components/AiVisualization.tsx 保持同步
 */
import type { AiVisualizationSpec } from '@/types'

// ─── 字段名 → 中文标签 ────────────────────────────────────────────────────────
const FIELD_LABEL_MAP: Record<string, string> = {
  id: 'ID', name: '名称', created_at: '创建时间', updated_at: '更新时间',
  remark: '备注', status: '状态',
  // 商品
  product_id: '商品ID', product_name: '商品名称', productName: '商品名称',
  sku: 'SKU', barcode: '条码', category_id: '分类ID', category_name: '分类', categoryName: '分类',
  spec: '规格', unit: '单位', cost_price: '成本价', costPrice: '成本价',
  sell_price: '售价', sellPrice: '售价', stock_qty: '库存数量', stockQty: '库存数量',
  safe_stock: '安全库存', safeStock: '安全库存', origin: '产地', year: '年份',
  season: '季节', batch_no: '批次号', batchNo: '批次号', tea_type: '茶叶类型', teaType: '茶叶类型',
  // 客户
  customer_id: '客户ID', customer_name: '客户名称', customerName: '客户名称',
  contact_name: '联系人', contactName: '联系人', phone: '电话', address: '地址',
  total_amount: '总金额', totalAmount: '总金额',
  receivable_amount: '应收金额', receivableAmount: '应收金额',
  // 供应商
  supplier_id: '供应商ID', supplier_name: '供应商名称', supplierName: '供应商名称',
  supply_category: '供货品类', payment_terms: '付款方式',
  // 订单
  order_no: '订单编号', orderNo: '订单编号',
  received_amount: '已收金额', receivedAmount: '已收金额',
  paid_amount: '已付金额', paidAmount: '已付金额',
  returned_amount: '退货金额', returnedAmount: '退货金额',
  unpaid_amount: '未付金额', unpaidAmount: '未付金额',
  unreceived_amount: '未收金额', unreceivedAmount: '未收金额',
  quantity: '数量', package_qty: '包装数', packageQty: '包装数',
  loose_qty: '散数', looseQty: '散数',
  package_unit: '包装单位', packageUnit: '包装单位',
  package_size: '每包装数量', packageSize: '每包装数量',
  unit_price: '单价', unitPrice: '单价',
  subtotal: '小计', cost_amount: '成本金额', costAmount: '成本金额',
  gross_profit: '毛利', grossProfit: '毛利', profit_rate: '毛利率', profitRate: '毛利率',
  net_sales: '净销售额', netSales: '净销售额', net_cost: '净成本', netCost: '净成本',
  net_profit: '净毛利', netProfit: '净毛利', net_profit_rate: '净毛利率', netProfitRate: '净毛利率',
  gross_profit_rate: '毛利率', grossProfitRate: '毛利率',
  total_sales: '总销售额', totalSales: '总销售额', total_cost: '总成本', totalCost: '总成本',
  total_profit: '总毛利', totalProfit: '总毛利', total_revenue: '总营业额', totalRevenue: '总营业额',
  avg_profit_rate: '平均毛利率', avgProfitRate: '平均毛利率',
  // 退货/售后
  return_no: '退货单号', returnNo: '退货单号',
  refund_no: '退款单号', refundNo: '退款单号',
  exchange_no: '换货单号', exchangeNo: '换货单号',
  return_amount: '退货金额', returnAmount: '退货金额',
  refund_amount: '退款金额', refundAmount: '退款金额',
  exchange_amount: '换货金额', exchangeAmount: '换货金额',
  receive_amount: '补收金额', receiveAmount: '补收金额',
  direction: '方向', reason_code: '原因', reasonCode: '原因',
  sale_exchange_out: '换货出库',
  // 明细行计算字段
  unit_cost_price: '采购单价', unitCostPrice: '采购单价',
  unit_sell_price: '销售单价', unitSellPrice: '销售单价',
  line_total_amount: '行销售额', lineTotalAmount: '行销售额',
  line_cost_amount: '行成本', lineCostAmount: '行成本',
  line_gross_profit: '行毛利', lineGrossProfit: '行毛利',
  line_net_profit: '行净毛利', lineNetProfit: '行净毛利',
  line_profit_rate: '行毛利率', lineProfitRate: '行毛利率',
  // 统计
  total: '合计', count: '数量', cnt: '数量',
  order_count: '订单数', orderCount: '订单数',
  revenue: '营业额', sales: '销售额', amount: '金额',
  avg_amount: '平均金额', avgAmount: '平均金额',
  total_qty: '总数量', totalQty: '总数量',
  supplier_count: '供应商数', customer_count: '客户数',
  // 库存计算
  available_qty: '可用库存', availableQty: '可用库存',
  pending_qty: '待发数量', pendingQty: '待发数量',
  stock_status: '库存状态', stockStatus: '库存状态',
  // 采购/供应商
  std_cost_price: '标准采购价', stdCostPrice: '标准采购价',
  payment_terms_type: '账期类型', paymentTermsType: '账期类型',
  payment_days: '账期天数', paymentDays: '账期天数',
  // 售后
  biz_no: '业务单号', bizNo: '业务单号',
  biz_type: '业务类型', bizType: '业务类型',
  biz_amount: '业务金额', bizAmount: '业务金额',
  settlement_amount: '结算金额', settlementAmount: '结算金额',
  theoretical_difference: '理论差额', theoreticalDifference: '理论差额',
  difference_amount: '差额', differenceAmount: '差额',
  should_receive_amount: '应收差额', shouldReceiveAmount: '应收差额',
  row_type: '记录类型', rowType: '记录类型',
  // 客户跟进
  follow_type: '跟进方式', followType: '跟进方式',
  intent_level: '意向等级', intentLevel: '意向等级',
  next_follow_date: '下次跟进时间', nextFollowDate: '下次跟进时间',
  last_content: '最近跟进内容', lastContent: '最近跟进内容',
  last_follow_at: '最近跟进时间', lastFollowAt: '最近跟进时间',
  last_follow_date: '最近跟进日期', lastFollowDate: '最近跟进日期',
  overdue_days: '逾期天数', overdueDays: '逾期天数',
  // 时间
  date: '日期', sale_date: '销售日期', saleDate: '销售日期',
  order_date: '订单日期', orderDate: '订单日期',
  purchase_date: '采购日期', purchaseDate: '采购日期',
  month: '月份', week: '周', year_month: '年月', day: '日期', orders: '订单数',
  // 采购
  purchase_order_id: '采购单ID', sale_order_id: '销售单ID',
  total_received: '已收款总额', totalReceived: '已收款总额',
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

export function fieldToLabel(field: string): string {
  if (FIELD_LABEL_MAP[field]) return FIELD_LABEL_MAP[field]
  const asSnake = field.replace(/([A-Z])/g, '_$1').toLowerCase()
  if (FIELD_LABEL_MAP[asSnake]) return FIELD_LABEL_MAP[asSnake]
  return field
}

// ─── 自动检测可视化类型（与 Web 端逻辑对齐）──────────────────────────────────
export function detectVisualization(
  rows: Record<string, unknown>[],
  question: string,
): AiVisualizationSpec {
  if (!rows || rows.length === 0) return { type: 'none' }
  const cols = Object.keys(rows[0])
  if (cols.length === 0) return { type: 'none' }
  if (cols.length === 1 && rows.length === 1) return { type: 'none' }

  const numericCols = cols.filter((c) => {
    const v = rows[0][c]
    return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
  })
  const stringCols = cols.filter((c) => {
    const v = rows[0][c]
    return typeof v === 'string' && isNaN(Number(v))
  })
  const dateCols = cols.filter((c) => /^\d{4}-\d{2}/.test(String(rows[0][c] ?? '')))

  const q = question
  const isChartRequest = CHART_REQUEST_RE.test(q)
  const isProportion = /占比|百分|比例|构成|分布/.test(q) && rows.length <= 10
  const isTrend = /趋势|走势|变化|按月|每月|每周|按日|每天|月份/.test(q) &&
    (dateCols.length > 0 || stringCols.length > 0)

  // 用户明确要求图表时，优先匹配
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

  // 占比类 → 饼图
  if (isProportion && numericCols.length >= 1 && stringCols.length >= 1) {
    const valueField = pickPreferredNumericField(numericCols)
    if (valueField) return { type: 'pie', nameField: stringCols[0], valueField }
  }

  // 趋势类 → 折线图
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

  // 列数多或行数多 → 表格（放在图表规则之后）
  if (cols.length >= 5 || rows.length > 25) return { type: 'table' }

  if (rows.length > 1 || cols.length > 2) return { type: 'table' }

  return { type: 'none' }
}

// ─── 数值格式化 ───────────────────────────────────────────────────────────────
export function fmtNum(v: unknown): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (isNaN(n)) return String(v)
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)
}
