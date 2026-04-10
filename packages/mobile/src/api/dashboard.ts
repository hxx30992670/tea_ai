import request from './index'
import type { ApiResponse, DashboardOverview, SalesTrend, StockWarning, TopProduct } from '@/types'

interface ServerOverview {
  todayRevenue: number
  monthRevenue: number
  inventoryValue: number
  receivableTotal: number
  saleReturnTotal: number
  purchaseReturnTotal: number
  refundTotal: number
  supplierRefundTotal: number
}

interface ServerStockWarning {
  productId: number
  productName: string
  warningType: 'safe_stock' | 'expiry'
  level: 'critical' | 'high' | 'medium'
  stockQty: number
  safeStock: number
  remainingDays?: number
}

interface ServerSalesTrend {
  period: string
  points: Array<{ label: string; amount: number; orderCount: number }>
}

interface ServerTopProduct {
  productId: number
  productName: string
  totalQuantity: number
  totalSales: number
}

interface ServerTopProductsResult {
  type: string
  list: ServerTopProduct[]
}

export const dashboardApi = {
  overview: async (): Promise<DashboardOverview> => {
    const res = await request.get<never, ApiResponse<ServerOverview>>('/dashboard/overview')
    const d = res.data
    return {
      todayRevenue: d.todayRevenue ?? 0,
      monthRevenue: d.monthRevenue ?? 0,
      stockValue: d.inventoryValue ?? 0,
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
    const res = await request.get<never, ApiResponse<ServerStockWarning[]>>(
      '/dashboard/stock-warnings',
    )
    return (res.data ?? []).map((w) => ({
      id: `${w.productId}-${w.warningType}`,
      productName: w.productName,
      type: w.warningType === 'safe_stock' ? 'low_stock' : 'expiring',
      stockQty: w.stockQty ?? 0,
      safeStock: w.safeStock ?? 0,
      shelfDaysLeft: w.remainingDays,
      urgency: w.level === 'critical' ? 'high' : w.level === 'high' ? 'medium' : 'low',
    }))
  },
}
