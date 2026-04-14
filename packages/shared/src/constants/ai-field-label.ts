/**
 * AI 可视化字段名 → 中文标签映射
 * Web端和Mobile端共享，统一维护
 */

// ─── 字段名 → 中文标签映射 ────────────────────────────────────────────────────
export const FIELD_LABEL_MAP: Record<string, string> = {
  section: "分组",
  metric: "指标",
  label: "标签",
  value: "值",
  rank: "排名",
  totalQuantity: "总数量",
  warningType: "预警类型",
  level: "预警等级",
  // 通用
  id: "ID",
  name: "名称",
  created_at: "创建时间",
  createdAt: "创建时间",
  updated_at: "更新时间",
  updatedAt: "更新时间",
  remark: "备注",
  status: "状态",
  // 商品
  product_id: "商品ID",
  productId: "商品ID",
  product_name: "商品名称",
  productName: "商品名称",
  sku: "SKU",
  barcode: "条码",
  category_id: "分类ID",
  category_name: "分类",
  categoryName: "分类",
  spec: "规格",
  unit: "单位",
  cost_price: "成本价",
  costPrice: "成本价",
  sell_price: "售价",
  sellPrice: "售价",
  stock_qty: "库存数量",
  stockQty: "库存数量",
  safe_stock: "安全库存",
  safeStock: "安全库存",
  origin: "产地",
  year: "年份",
  season: "季节",
  // 客户
  customer_id: "客户ID",
  customerId: "客户ID",
  customer_name: "客户名称",
  customerName: "客户名称",
  contact_name: "联系人",
  contactName: "联系人",
  phone: "电话",
  mobile: "手机号码",
  tel: "联系电话",
  contact_phone: "联系人电话",
  contactPhone: "联系人电话",
  customer_phone: "联系电话",
  customerPhone: "联系电话",
  supplier_phone: "供应商电话",
  supplierPhone: "供应商电话",
  address: "地址",
  total_amount: "总金额",
  totalAmount: "总金额",
  receivable_amount: "应收金额",
  receivableAmount: "应收金额",
  // 供应商
  supplier_id: "供应商ID",
  supplierId: "供应商ID",
  supplier_name: "供应商名称",
  supplierName: "供应商名称",
  supply_category: "供货品类",
  payment_terms: "付款方式",
  // 订单通用
  order_no: "订单编号",
  orderNo: "订单编号",
  order_id: "订单ID",
  orderId: "订单ID",
  received_amount: "已收金额",
  receivedAmount: "已收金额",
  paid_amount: "已付金额",
  paidAmount: "已付金额",
  returned_amount: "退货金额",
  returnedAmount: "退货金额",
  unpaid_amount: "未付金额",
  unpaidAmount: "未付金额",
  unreceived_amount: "未收金额",
  unreceivedAmount: "未收金额",
  total_sales_amount: "销售额",
  totalSalesAmount: "销售额",
  done: "已完成",
  shipped: "已出货",
  returned: "已退完",
  draft: "草稿",
  processing: "售后处理中",
  pending: "待处理",
  confirmed: "已确认",
  cancelled: "已取消",
  expired: "已过期",
  // 销售订单
  sale_order_id: "销售单ID",
  saleOrderId: "销售单ID",
  quantity: "数量",
  package_qty: "包装数",
  packageQty: "包装数",
  loose_qty: "散数",
  looseQty: "散数",
  package_unit: "包装单位",
  packageUnit: "包装单位",
  package_size: "每包装数量",
  packageSize: "每包装数量",
  unit_price: "单价",
  unitPrice: "单价",
  subtotal: "小计",
  item_subtotal: "小计",
  itemSubtotal: "小计",
  cost_amount: "成本金额",
  costAmount: "成本金额",
  gross_profit: "毛利",
  grossProfit: "毛利",
  profit_rate: "毛利率",
  profitRate: "毛利率",
  // 采购订单
  purchase_order_id: "采购单ID",
  purchaseOrderId: "采购单ID",
  // 退货/售后
  return_no: "退货单号",
  returnNo: "退货单号",
  refund_no: "退款单号",
  refundNo: "退款单号",
  exchange_no: "换货单号",
  exchangeNo: "换货单号",
  return_amount: "退货金额",
  returnAmount: "退货金额",
  refund_amount: "退款金额",
  refundAmount: "退款金额",
  exchange_amount: "换货金额",
  exchangeAmount: "换货金额",
  receive_amount: "补收金额",
  receiveAmount: "补收金额",
  direction: "方向",
  reason_code: "原因",
  reasonCode: "原因",
  sale_exchange_out: "换货出库",
  saleExchangeOut: "换货出库",
  // 商品属性（product 表字段及常用别名）
  batch_no: "批次号",
  batchNo: "批次号",
  tea_type: "茶叶类型",
  teaType: "茶叶类型",
  // 明细行计算字段（AI 生成 SQL 中按行计算的别名）
  unit_cost_price: "采购单价",
  unitCostPrice: "采购单价",
  unit_sell_price: "销售单价",
  unitSellPrice: "销售单价",
  line_total_amount: "行销售额",
  lineTotalAmount: "行销售额",
  line_cost_amount: "行成本",
  lineCostAmount: "行成本",
  line_gross_profit: "行毛利",
  lineGrossProfit: "行毛利",
  line_net_profit: "行净毛利",
  lineNetProfit: "行净毛利",
  line_profit_rate: "行毛利率",
  lineProfitRate: "行毛利率",
  // 净口径统计（AI 生成 SQL 的常用别名）
  net_sales: "净销售额",
  netSales: "净销售额",
  net_cost: "净成本",
  netCost: "净成本",
  net_profit: "净毛利",
  netProfit: "净毛利",
  net_profit_rate: "净毛利率",
  netProfitRate: "净毛利率",
  gross_profit_rate: "毛利率",
  grossProfitRate: "毛利率",
  // 销售/采购汇总
  total_sales: "总销售额",
  totalSales: "总销售额",
  total_cost: "总成本",
  totalCost: "总成本",
  total_profit: "总毛利",
  totalProfit: "总毛利",
  total_revenue: "总营业额",
  totalRevenue: "总营业额",
  avg_profit_rate: "平均毛利率",
  avgProfitRate: "平均毛利率",
  // 通用统计
  total: "合计",
  count: "数量",
  cnt: "数量",
  order_count: "订单数",
  orderCount: "订单数",
  revenue: "营业额",
  sales: "销售额",
  amount: "金额",
  avg_amount: "平均金额",
  avgAmount: "平均金额",
  total_qty: "总数量",
  totalQty: "总数量",
  supplier_count: "供应商数",
  supplierCount: "供应商数",
  customer_count: "客户数",
  customerCount: "客户数",
  // 库存计算字段
  available_qty: "可用库存",
  availableQty: "可用库存",
  pending_qty: "待发数量",
  pendingQty: "待发数量",
  stock_status: "库存状态",
  stockStatus: "库存状态",
  // 采购/供应商
  std_cost_price: "标准采购价",
  stdCostPrice: "标准采购价",
  payment_terms_type: "账期类型",
  paymentTermsType: "账期类型",
  payment_days: "账期天数",
  paymentDays: "账期天数",
  // 客户跟进
  follow_type: "跟进方式",
  followType: "跟进方式",
  intent_level: "意向等级",
  intentLevel: "意向等级",
  next_follow_date: "下次跟进时间",
  nextFollowDate: "下次跟进时间",
  last_content: "最近跟进内容",
  lastContent: "最近跟进内容",
  last_follow_at: "最近跟进时间",
  lastFollowAt: "最近跟进时间",
  last_follow_date: "最近跟进日期",
  lastFollowDate: "最近跟进日期",
  overdue_days: "逾期天数",
  overdueDays: "逾期天数",
  // 售后/换货
  biz_no: "业务单号",
  bizNo: "业务单号",
  biz_type: "业务类型",
  bizType: "业务类型",
  biz_amount: "业务金额",
  bizAmount: "业务金额",
  settlement_amount: "结算金额",
  settlementAmount: "结算金额",
  theoretical_difference: "理论差额",
  theoreticalDifference: "理论差额",
  difference_amount: "差额",
  differenceAmount: "差额",
  should_receive_amount: "应收差额",
  shouldReceiveAmount: "应收差额",
  row_type: "记录类型",
  rowType: "记录类型",
  // 时间/日期别名
  date: "日期",
  base_unit: "基础单位",
  baseUnit: "基础单位",
  sale_date: "销售日期",
  saleDate: "销售日期",
  order_date: "订单日期",
  orderDate: "订单日期",
  purchase_date: "采购日期",
  purchaseDate: "采购日期",
  month: "月份",
  week: "周",
  year_month: "年月",
  yearMonth: "年月",
  day: "日期",
  orders: "订单数",
  // 其他（从 mobile 端补充）
  total_received: "已收款总额",
  totalReceived: "已收款总额",
  today_revenue: "今日营收",
  todayRevenue: "今日营收",
  month_revenue: "本月营收",
  monthRevenue: "本月营收",
  inventory_value: "库存价值",
  inventoryValue: "库存价值",
  receivable_total: "当前应收",
  receivableTotal: "当前应收",
  sale_return_total: "销售退货金额",
  saleReturnTotal: "销售退货金额",
};

// ─── 方向字段值映射 ────────────────────────────────────────────────────────────
export const DIRECTION_VALUE_MAP: Record<string, string> = {
  return: "退回",
  out: "换出",
};

export const SECTION_VALUE_MAP: Record<string, string> = {
  overview: "经营概览",
  sales_trend: "销售趋势",
  top_product: "热销商品",
  stock_warning: "库存预警",
  after_sales_reason: "售后原因",
  meta: "元数据",
};

export const METRIC_VALUE_MAP: Record<string, string> = {
  todayRevenue: "今日营收",
  monthRevenue: "本月营收",
  inventoryValue: "库存价值",
  receivableTotal: "当前应收",
  saleReturnTotal: "销售退货金额",
  refundTotal: "退款金额",
};

export const STATUS_VALUE_MAP: Record<string, string> = {
  done: "已完成",
  shipped: "已出货",
  returned: "已退完",
  draft: "草稿",
  processing: "售后处理中",
  pending: "待处理",
  confirmed: "已确认",
  cancelled: "已取消",
  expired: "已过期",
};

// ─── 非指标数值字段（这些数值字段不用于绘图）───────────────────────────────────
export const NON_METRIC_NUMERIC_FIELDS = new Set([
  "id",
  "year",
  "customer_id",
  "customerId",
  "supplier_id",
  "supplierId",
  "product_id",
  "productId",
  "sale_order_id",
  "saleOrderId",
  "purchase_order_id",
  "purchaseOrderId",
  "package_size",
  "packageSize",
  "phone",
  "mobile",
  "tel",
  "contact_phone",
  "contactPhone",
  "customer_phone",
  "customerPhone",
  "supplier_phone",
  "supplierPhone",
]);

// ─── 明细记录字段（有这些字段时默认展示表格而非图表）──────────────────────────
export const DETAIL_RECORD_FIELDS = [
  "order_no",
  "orderNo",
  "return_no",
  "returnNo",
  "refund_no",
  "refundNo",
  "exchange_no",
  "exchangeNo",
  "batch_no",
  "batchNo",
  "created_at",
  "createdAt",
];

// ─── 数量字段集合（这些字段的值代表"数量"，需要带上包装单位换算）──────────────────
export const QTY_FIELDS = new Set([
  "stock_qty",
  "stockQty",
  "quantity",
  "total_qty",
  "totalQty",
  "available_qty",
  "availableQty",
  "pending_qty",
  "pendingQty",
  "safe_stock",
  "safeStock",
  "package_qty",
  "packageQty",
  "loose_qty",
  "looseQty",
]);

// ─── 工具函数 ────────────────────────────────────────────────────────────────────

/** 将字段名转为可读中文标签 */
export function fieldToLabel(field: string): string {
  if (FIELD_LABEL_MAP[field]) return FIELD_LABEL_MAP[field];
  // 尝试 camelCase 转 snake_case 后再查一次（如 netSales → net_sales）
  const asSnake = field.replace(/([A-Z])/g, "_$1").toLowerCase();
  if (FIELD_LABEL_MAP[asSnake]) return FIELD_LABEL_MAP[asSnake];
  // 兜底：直接返回原字段名，让用户能看出这是一个待补充的字段
  return field;
}

/** 数值格式化（整数用千分位，小数保留两位） */
export function fmtNum(v: unknown): string {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

/** 基础数值格式化（不处理 null/undefined） */
export function fmtNumRaw(v: number): string | number {
  return Number.isInteger(v) ? v : Number(v.toFixed(2));
}

/**
 * 如果查询结果包含 unit / package_unit / package_size，
 * 尝试为数量值追加包装单位换算文本
 */
export function fmtQtyWithUnit(
  value: number,
  fieldName: string,
  row: Record<string, unknown>,
  rows: Record<string, unknown>[],
): string {
  const fmted = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toFixed(2);
  if (!QTY_FIELDS.has(fieldName)) return fmted;

  const src = row ?? rows[0] ?? {};
  const unit = (src.unit ?? src.base_unit) as string | undefined;
  const pkgUnit = (src.package_unit ?? src.packageUnit) as string | undefined;
  const pkgSize = Number(src.package_size ?? src.packageSize) || 0;

  if (!unit) return fmted;

  if (pkgUnit && pkgSize > 1) {
    const pkgQty = Math.floor(value / pkgSize);
    const loose = value % pkgSize;
    const parts: string[] = [];
    if (pkgQty > 0) parts.push(`${pkgQty.toLocaleString()} ${pkgUnit}`);
    if (loose > 0) parts.push(`${loose} ${unit}`);
    if (parts.length === 0) parts.push(`0 ${unit}`);
    return `${fmted} ${unit}（${parts.join(" ")}）`;
  }

  return `${fmted} ${unit}`;
}

/** 格式化字段值（处理 direction 等特殊字段） */
export function fmtFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (field === "status" && typeof value === "string") {
    return STATUS_VALUE_MAP[value] ?? value;
  }
  if (field === "direction" && typeof value === "string") {
    return DIRECTION_VALUE_MAP[value] ?? value;
  }
  if (field === "section" && typeof value === "string") {
    return SECTION_VALUE_MAP[value] ?? value;
  }
  if (field === "metric" && typeof value === "string") {
    return METRIC_VALUE_MAP[value] ?? value;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

/** 统一获取结果列，避免异构行只显示第一行字段 */
export function getDisplayColumns(rows: Record<string, unknown>[]): string[] {
  const preferred = [
    "section",
    "metric",
    "label",
    "value",
    "amount",
    "orderCount",
    "rank",
    "productName",
    "teaType",
    "totalQuantity",
    "totalSales",
    "warningType",
    "stockQty",
    "safeStock",
    "level",
    "reasonCode",
    "count",
  ];

  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }

  return [...columns].sort((a, b) => {
    const aIdx = preferred.indexOf(a);
    const bIdx = preferred.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b, "zh-CN");
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}

/** 判断是否为策略快照异构行 */
export function isStrategySnapshotRows(
  rows: Record<string, unknown>[],
): boolean {
  if (!rows.length) return false;
  const sections = new Set(
    rows
      .map((row) => (typeof row.section === "string" ? row.section : ""))
      .filter(Boolean),
  );
  return sections.size > 1 && sections.has("overview");
}

/** 仅汇总真正的业务指标列，避免年份/电话/section 这类字段被错误求和 */
export function isSummarizableMetricField(
  field: string,
  values: unknown[],
): boolean {
  if (NON_METRIC_NUMERIC_FIELDS.has(field)) return false;
  if (["section", "metric", "label", "rank", "orderCount"].includes(field))
    return false;
  if (/(_no|No|phone|mobile|tel|year|date|time)$/i.test(field)) return false;
  const numericValues = values
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value) && value !== 0);
  return numericValues.length === values.length && values.length > 1;
}
