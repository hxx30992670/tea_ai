/**
 * 数据看板 API 接口
 * 封装营业概览、销售趋势、热销商品及库存预警等数据请求
 * 包含服务端字段名到前端字段名的转换逻辑
 */
import request from './index'
import type { AfterSaleReasonStat, ApiResponse, DashboardOverview, SalesTrend, TopProduct, StockWarning } from '@/types'

// ─── 服务端原始类型 ────────────────────────────────────────
interface ServerOverview {
  todayRevenue: number
  monthRevenue: number
  inventoryValue: number   // 前端叫 stockValue
  receivableTotal: number
  saleReturnTotal: number
  purchaseReturnTotal: number
  refundTotal: number
  supplierRefundTotal: number
}

interface ServerSalesTrendPoint {
  label: string
  amount: number
  orderCount: number
}

interface ServerSalesTrend {
  period: string
  points: ServerSalesTrendPoint[]
}

interface ServerTopProduct {
  productId: number
  productName: string
  sku: string
  teaType: string
  totalQuantity: number   // 前端叫 totalQty
  totalSales: number      // 前端叫 totalAmount
}

interface ServerTopProductsResult {
  type: string
  list: ServerTopProduct[]
}

interface ServerStockWarning {
  productId: number       // 前端用 id
  productName: string
  sku: string
  teaType: string
  warningType: 'safe_stock' | 'expiry'   // 前端叫 type: 'low_stock'/'expiring'
  stockQty: number
  safeStock: number
  level: 'critical' | 'high' | 'medium'  // 前端叫 urgency，且 critical → high
  remainingDays?: number  // 前端叫 shelfDaysLeft
}

// ─── 字段映射工具 ─────────────────────────────────────────
function mapWarningType(t: 'safe_stock' | 'expiry'): 'low_stock' | 'expiring' {
  return t === 'safe_stock' ? 'low_stock' : 'expiring'
}

function mapLevel(l: 'critical' | 'high' | 'medium'): 'high' | 'medium' | 'low' {
  return l === 'critical' ? 'high' : l === 'high' ? 'medium' : 'low'
}

// ─── API ───────────────────────────────────────────────────
export const dashboardApi = {
  overview: async (): Promise<DashboardOverview> => {
    const res = await request.get<never, ApiResponse<ServerOverview>>('/dashboard/overview')
    const d = res.data
    return {
      todayRevenue: d.todayRevenue ?? 0,
      monthRevenue: d.monthRevenue ?? 0,
      stockValue: d.inventoryValue ?? 0,   // 字段名映射
      receivableTotal: d.receivableTotal ?? 0,
      saleReturnTotal: d.saleReturnTotal ?? 0,
      purchaseReturnTotal: d.purchaseReturnTotal ?? 0,
      refundTotal: d.refundTotal ?? 0,
      supplierRefundTotal: d.supplierRefundTotal ?? 0,
    }
  },

  salesTrend: async (period = 'day'): Promise<SalesTrend[]> => {
    const res = await request.get<never, ApiResponse<ServerSalesTrend>>('/dashboard/sales-trend', {
      params: { period },
    })
    return (res.data.points ?? []).map((p) => ({
      date: p.label,
      revenue: p.amount ?? 0,
      orders: p.orderCount ?? 0,
    }))
  },

  topProducts: async (): Promise<TopProduct[]> => {
    const res = await request.get<never, ApiResponse<ServerTopProductsResult>>('/dashboard/top-products')
    return (res.data.list ?? []).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      totalQty: Number(p.totalQuantity ?? 0),
      totalAmount: Number(p.totalSales ?? 0),
    }))
  },

  stockWarnings: async (): Promise<StockWarning[]> => {
    const res = await request.get<never, ApiResponse<ServerStockWarning[]>>('/dashboard/stock-warnings')
    return (res.data ?? []).map((w) => ({
      id: `${w.productId}-${w.warningType}`,
      productId: w.productId,
      productName: w.productName,
      type: mapWarningType(w.warningType),
      stockQty: w.stockQty ?? 0,
      safeStock: w.safeStock ?? 0,
      shelfDaysLeft: w.remainingDays,
      urgency: mapLevel(w.level),
    }))
  },

  afterSalesReasons: async (): Promise<AfterSaleReasonStat[]> => {
    const res = await request.get<never, ApiResponse<AfterSaleReasonStat[]>>('/dashboard/after-sales-reasons')
    return res.data ?? []
  },
}
