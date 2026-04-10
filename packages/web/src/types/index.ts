/**
 * 茶掌柜 Web 端 - 全局类型定义
 * 包含 API 响应、分页、认证及所有业务实体的 TypeScript 类型
 */

/** 统一 API 响应格式（与后端 { code, message, data } 对应） */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 分页结果集 */
export interface PageResult<T = unknown> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// ===== 认证相关 =====

/** 登录表单 */
export interface LoginForm {
  username: string
  password: string
}

/** 用户信息 */
export interface UserInfo {
  id: number
  username: string
  realName: string
  role: 'admin' | 'manager' | 'staff'  // 管理员/店长/店员
  status: number
  phone?: string
  roleProfile?: {
    code: 'admin' | 'manager' | 'staff'
    name: string
    description: string
  }
}

/** 登录结果（包含 Token） */
export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: UserInfo
}

// ===== 商品相关 =====

/** 商品信息（茶叶批发支持多单位、批次、产地等专业字段） */
export interface Product {
  id: number
  name: string
  sku: string
  barcode?: string
  categoryId?: number
  categoryName?: string
  spec?: string
  unit?: string
  packageUnit?: string
  packageSize?: number
  costPrice: number
  sellPrice: number
  stockQty: number
  safeStock?: number
  imageUrl?: string
  status: number
  extData?: Record<string, unknown>
  teaType?: string
  origin?: string
  year?: number
  batchNo?: string
  season?: string
  shelfLife?: number
  productionDate?: string
  producedAt?: string
  storageCond?: string
  remark?: string
  createdAt: string
}

import type { AfterSaleReasonCode } from '@/constants/after-sale'
import type { PaymentRecordType, PurchaseOrderStatus, SaleOrderStatus } from '@/constants/order'

export interface Category {
  id: number
  name: string
  parentId?: number
  sortOrder?: number
  children?: Category[]
}

// ===== 库存相关 =====

/** 库存变动记录（入库/出库流水） */
export interface StockRecord {
  id: number
  productId: number
  productName: string
  type: 'in' | 'out'
  reason: string
  quantity: number
  packageQty?: number | null
  looseQty?: number | null
  packageUnit?: string | null
  packageSize?: number | null
  beforeQty: number
  afterQty: number
  unit?: string
  remark?: string
  createdAt: string
}

export interface StockWarning {
  /** 同一商品可能有多条预警（如库存+临期），需与 warningType 组合保证唯一 */
  id: string
  productName: string
  type: 'low_stock' | 'expiring'
  stockQty: number
  safeStock: number
  shelfDaysLeft?: number
  urgency: 'high' | 'medium' | 'low'
}

// ===== 客户相关 =====

/** 客户档案 */
export interface Customer {
  id: number
  name: string
  contactName?: string
  phone?: string
  address?: string
  remark?: string
  totalAmount?: number
  receivableAmount?: number
  createdAt: string
}

// ===== 供应商相关 =====

/** 供应商档案 */
export interface Supplier {
  id: number
  name: string
  contactName?: string
  phone?: string
  address?: string
  supplyCategory?: string
  paymentTerms?: string
  paymentTermsType?: 'cash' | 'contract' | 'days'
  paymentDays?: number
  remark?: string
  createdAt: string
}

// 采购订单
export interface PurchaseOrder {
  id: number
  orderNo: string
  supplierId: number
  supplierName?: string
  totalAmount: number
  paidAmount: number
  returnedAmount: number
  status: PurchaseOrderStatus
  remark?: string
  createdAt: string
  items?: PurchaseOrderItem[]
  returns?: PurchaseReturn[]
}

export interface PurchaseOrderItem {
  id: number
  orderId?: number
  productId: number
  productName: string
  quantity: number
  packageQty?: number | null
  looseQty?: number | null
  packageUnit?: string | null
  packageSize?: number | null
  unit?: string
  unitPrice: number
  subtotal: number
  returnedQuantity?: number
  remainingQuantity?: number
}

export interface PurchaseReturn {
  id: number
  returnNo?: string
  purchaseOrderId: number
  totalAmount: number
  refundAmount: number
  remark?: string
  createdAt: string
  items?: PurchaseReturnItem[]
}

export interface PurchaseReturnItem {
  id: number
  returnId: number
  purchaseOrderItemId: number
  productId: number
  productName?: string
  quantity: number
  packageQty?: number | null
  looseQty?: number | null
  packageUnit?: string | null
  packageSize?: number | null
  unit?: string
  unitPrice: number
  subtotal: number
}

// ===== 销售订单 =====

/** 销售订单主表 */
export interface SaleOrder {
  id: number
  orderNo: string
  customerId?: number
  customerName?: string
  totalAmount: number
  costAmount?: number
  receivedAmount: number
  returnedAmount: number
  status: SaleOrderStatus
  remark?: string
  createdAt: string
  items?: SaleOrderItem[]
  returns?: SaleReturn[]
  refunds?: SaleRefund[]
  exchanges?: SaleExchange[]
}

export interface SaleOrderItem {
  id: number
  orderId?: number
  productId: number
  productName: string
  quantity: number
  packageQty?: number | null
  looseQty?: number | null
  packageUnit?: string | null
  packageSize?: number | null
  unit?: string
  unitPrice: number
  subtotal: number
  returnedQuantity?: number
  remainingQuantity?: number
}

export interface SaleReturn {
  id: number
  returnNo?: string
  saleOrderId: number
  totalAmount: number
  refundAmount: number
  reasonCode?: AfterSaleReasonCode | string
  reasonNote?: string
  remark?: string
  createdAt: string
  items?: SaleReturnItem[]
}

export interface SaleRefund {
  id: number
  refundNo?: string
  saleOrderId: number
  amount: number
  method?: string
  reasonCode?: AfterSaleReasonCode | string
  reasonNote?: string
  remark?: string
  createdAt: string
}

export interface SaleExchange {
  id: number
  exchangeNo?: string
  saleOrderId: number
  returnAmount: number
  exchangeAmount: number
  refundAmount: number
  receiveAmount?: number
  reasonCode?: AfterSaleReasonCode | string
  reasonNote?: string
  remark?: string
  createdAt: string
  items?: SaleExchangeItem[]
}

export interface SaleExchangeItem {
  id: number
  exchangeId: number
  direction: 'return' | 'out'
  saleOrderItemId?: number | null
  productId: number
  productName?: string
  quantity: number
  packageQty?: number | null
  looseQty?: number | null
  packageUnit?: string | null
  packageSize?: number | null
  unit?: string
  unitPrice: number
  subtotal: number
}

export interface SaleReturnItem {
  id: number
  returnId: number
  saleOrderItemId: number
  productId: number
  productName?: string
  quantity: number
  packageQty?: number | null
  looseQty?: number | null
  packageUnit?: string | null
  packageSize?: number | null
  unit?: string
  unitPrice: number
  subtotal: number
}

// ===== 收付款记录 =====

/** 收付款流水（关联销售/采购订单） */
export interface PaymentRecord {
  id: number
  saleOrderId?: number
  purchaseOrderId?: number
  amount: number
  type: 'receive' | 'pay' | 'refund' | 'supplier_refund'
  relatedType?: string
  relatedId?: number
  orderNo?: string
  paymentMethod?: string
  method?: string
  remark?: string
  createdAt: string
}

// ===== 数据看板 =====

/** 看板概览数据 */
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

export interface AfterSaleReasonStat {
  reasonCode: AfterSaleReasonCode | string
  count: number
  amount: number
}

export interface SalesTrend {
  date: string
  revenue: number
  orders: number
}

/** 热销商品统计 */
export interface TopProduct {
  productId: number
  productName: string
  totalQty: number
  totalAmount: number
}

// ===== 系统管理 =====

/** 系统用户 */
export interface SysUser {
  id: number
  username: string
  realName: string
  phone?: string
  role: 'admin' | 'manager' | 'staff'
  status: number
  createdAt: string
  updatedAt?: string
  roleProfile?: {
    code: 'admin' | 'manager' | 'staff'
    name: string
    description: string
  }
}

// ===== 系统管理 =====

/** 操作日志记录 */
export interface OperationLog {
  id: number
  operatorId?: number
  realName?: string
  username?: string
  module: string
  action: string
  detail?: string
  createdAt: string
}

// ===== AI 对话相关 =====

/** AI 数据可视化类型 */
export type AiVisualizationType = 'table' | 'bar' | 'line' | 'pie' | 'none'

/** 可视化图表规格定义 */
export interface AiVisualizationSpec {
  type: AiVisualizationType
  xField?: string
  yField?: string
  nameField?: string
  valueField?: string
}

/** AI 对话消息 */
export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  rows?: Record<string, unknown>[]  // 查询结果（用于渲染图表）
  visualization?: AiVisualizationSpec
  imageUrl?: string       // 用户上传的图片预览（base64 data URL）
  attachmentName?: string // 用户上传的文件名（文本文件）
}

/** AI 对话记录 */
export interface AiConversation {
  id: number
  sessionId?: string
  question: string
  answer: string
  sqlGenerated?: string  // AI 生成的 SQL 语句
  createdAt: string
  rows?: Record<string, unknown>[]
}
