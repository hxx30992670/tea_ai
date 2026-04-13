/** 统一 API 响应格式 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PageResult<T = unknown> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// ===== Auth =====
export interface LoginForm {
  username: string
  password: string
}

export interface UserInfo {
  id: number
  username: string
  realName: string
  role: 'admin' | 'manager' | 'staff'
  status: number
  phone?: string
  roleProfile?: {
    code: 'admin' | 'manager' | 'staff'
    name: string
    description: string
  }
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: UserInfo
}

// ===== Product =====
export interface Product {
  id: number
  name: string
  sku: string
  barcode?: string
  categoryId?: number
  categoryName?: string
  categoryPath?: string[]
  spec?: string
  unit?: string
  packageUnit?: string
  packageSize?: number
  costPrice: number
  sellPrice: number
  stockQty: number
  safeStock?: number
  teaType?: string
  origin?: string
  year?: number
  batchNo?: string
  season?: string
  shelfLife?: number
  productionDate?: string
  storageCond?: string
  imageUrl?: string
  status: number
  extData?: Record<string, unknown>
  remark?: string
  createdAt: string
}

export interface Category {
  id: number
  name: string
  parentId?: number
  sortOrder?: number
  children?: Category[]
}

// ===== Customer =====
export interface Customer {
  id: number
  name: string
  contactName?: string
  phone?: string
  address?: string
  remark?: string
  receivable?: number
  createdAt: string
}

// ===== Supplier =====
export interface Supplier {
  id: number
  name: string
  contactName?: string
  phone?: string
  address?: string
  remark?: string
  createdAt: string
}

// ===== Stock =====
/** 入库原因 */
export type StockInReason = 'purchase' | 'opening' | 'return' | 'other'
/** 出库原因 */
export type StockOutReason = 'sale' | 'damage' | 'return' | 'other'

export interface StockOperationPayload {
  productId: number
  quantity?: number
  packageQty?: number
  looseQty?: number
  reason: string
  relatedOrderId?: number
  remark?: string
}

export interface StockRecord {
  id: number
  productId: number
  productName?: string
  type: 'in' | 'out'
  quantity: number
  packageQty?: number
  looseQty?: number
  reason: string
  relatedOrderId?: number
  remark?: string
  beforeQty?: number
  afterQty?: number
  operatorName?: string
  createdAt: string
}

// ===== Sale Order =====
/** 销售订单状态：draft→shipped→done / returned */
export type SaleOrderStatus = 'draft' | 'shipped' | 'done' | 'returned'

export interface SaleOrderItem {
  id?: number
  productId: number
  productName?: string
  spec?: string
  unit?: string
  quantity?: number
  packageQty?: number
  looseQty?: number
  unitPrice: number
  totalPrice?: number
}

export interface SaleOrder {
  id: number
  orderNo: string
  customerId?: number
  customerName?: string
  status: SaleOrderStatus
  totalAmount: number
  returnedAmount?: number
  paidAmount?: number
  receivable?: number
  remark?: string
  items?: SaleOrderItem[]
  returns?: SaleReturn[]
  refunds?: SaleRefund[]
  exchanges?: SaleExchange[]
  operatorName?: string
  createdAt: string
  updatedAt?: string
}

export interface SaleReturn {
  id: number
  returnNo?: string
  totalAmount: number
  refundAmount: number
  reasonCode?: string
  reasonNote?: string
  remark?: string
  createdAt: string
}

export interface SaleRefund {
  id: number
  refundNo?: string
  amount: number
  method?: string
  reasonCode?: string
  reasonNote?: string
  remark?: string
  createdAt: string
}

export interface SaleExchange {
  id: number
  exchangeNo?: string
  status?: 'draft' | 'processing' | 'completed' | 'cancelled'
  returnAmount: number
  exchangeAmount: number
  refundAmount: number
  receiveAmount?: number
  reasonCode?: string
  reasonNote?: string
  remark?: string
  createdAt: string
}

/** 售后原因码 */
export type AfterSaleReasonCode =
  | 'quality_issue'
  | 'taste_issue'
  | 'damaged_package'
  | 'wrong_goods'
  | 'customer_change_mind'
  | 'price_adjustment'
  | 'other'

// ===== Purchase Order =====
export type PurchaseOrderStatus = 'draft' | 'stocked' | 'done' | 'returned'

export interface PurchaseOrder {
  id: number
  orderNo: string
  supplierId?: number
  supplierName?: string
  status: PurchaseOrderStatus
  totalAmount: number
  paidAmount?: number
  remark?: string
  createdAt: string
}

// ===== Payment =====
export type PaymentRecordType = 'receive' | 'pay' | 'refund' | 'supplier_refund'

export interface PaymentRecord {
  id: number
  type: PaymentRecordType
  relatedType: string
  relatedId: number
  amount: number
  method?: string
  remark?: string
  operatorName?: string
  createdAt: string
}

// ===== Dashboard =====
export interface DashboardOverview {
  todayRevenue: number
  monthRevenue: number
  stockValue: number
  receivableTotal: number
  saleReturnTotal: number
  purchaseReturnTotal: number
  refundTotal: number
  supplierRefundTotal: number
}

export interface SalesTrend {
  date: string
  revenue: number
  orders: number
}

export interface TopProduct {
  productId: number
  productName: string
  totalQty: number
  totalAmount: number
}

export interface StockWarning {
  id: string
  productName: string
  type: 'low_stock' | 'expiring'
  stockQty: number
  safeStock: number
  shelfDaysLeft?: number
  urgency: 'high' | 'medium' | 'low'
}

export interface AfterSaleReasonStat {
  reasonCode: string
  count: number
  amount: number
}

// ===== AI =====
export interface AiChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatResult {
  enabled: boolean
  reason: string
  answer: string
}

export interface AiSession {
  sessionId: string
  title: string
  lastAt: string
}

/** 服务端返回的对话记录（每条为一问一答） */
export interface AiConversation {
  id: number
  sessionId?: string
  question: string
  answer: string
  sqlGenerated?: string
  rows?: Record<string, unknown>[]
  createdAt: string
}

/** AI 数据可视化类型 */
export type AiVisualizationType = 'table' | 'bar' | 'line' | 'pie' | 'none'

/** 可视化图表规格 */
export interface AiVisualizationSpec {
  type: AiVisualizationType
  xField?: string
  yField?: string
  nameField?: string
  valueField?: string
}

export interface AiSuggestion {
  type: string
  content: string
  productId?: number
}
