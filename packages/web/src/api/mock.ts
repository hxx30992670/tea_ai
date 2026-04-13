// 其他模块 API — 暂用 Mock 数据，接口签名已定义，后续替换 request 调用即可
import type {
  AfterSaleReasonStat, Product, Category, StockRecord, StockWarning,
  Customer, Supplier, PurchaseOrder, SaleOrder,
  PaymentRecord, DashboardOverview, SalesTrend,
  TopProduct, SysUser, OperationLog,
} from '@/types'

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms))

// ─── 看板 ─────────────────────────────────────────────
export const dashboardApi = {
  overview: async (): Promise<DashboardOverview> => {
    await delay()
    return {
      todayRevenue: 3680,
      monthRevenue: 128400,
      stockValue: 562000,
      receivableTotal: 45200,
      saleReturnTotal: 4200,
      purchaseReturnTotal: 3200,
      refundTotal: 1800,
      supplierRefundTotal: 1200,
    }
  },
  salesTrend: async (period = 'day'): Promise<SalesTrend[]> => {
    await delay()
    const now = Date.now()
    return Array.from({ length: period === 'month' ? 12 : 30 }, (_, i) => ({
      date: new Date(now - (29 - i) * 86400000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
      revenue: Math.floor(Math.random() * 8000 + 2000),
      orders: Math.floor(Math.random() * 20 + 5),
    }))
  },
  topProducts: async (): Promise<TopProduct[]> => {
    await delay()
    return [
      { productId: 1, productName: '西湖龙井 2026 春茶', totalQty: 320, totalAmount: 40960 },
      { productId: 2, productName: '武夷山大红袍', totalQty: 210, totalAmount: 25200 },
      { productId: 3, productName: '云南普洱饼茶', totalQty: 185, totalAmount: 18500 },
      { productId: 4, productName: '白毫银针 特级', totalQty: 160, totalAmount: 32000 },
      { productId: 5, productName: '铁观音清香型', totalQty: 145, totalAmount: 14500 },
      { productId: 6, productName: '正山小种红茶', totalQty: 130, totalAmount: 16900 },
      { productId: 7, productName: '黄山毛峰', totalQty: 110, totalAmount: 13200 },
      { productId: 8, productName: '蒙顶甘露', totalQty: 95, totalAmount: 11400 },
    ]
  },
  stockWarnings: async (): Promise<StockWarning[]> => {
    await delay()
    return [
      { id: '1-safe_stock', productId: 1, productName: '碧螺春（春茶）', type: 'low_stock', stockQty: 3, safeStock: 10, urgency: 'high' },
      { id: '2-expiry', productId: 2, productName: '白毫银针 2024 批次', type: 'expiring', stockQty: 25, safeStock: 10, shelfDaysLeft: 15, urgency: 'high' },
      { id: '3-safe_stock', productId: 3, productName: '信阳毛尖', type: 'low_stock', stockQty: 6, safeStock: 10, urgency: 'medium' },
    ]
  },
  afterSalesReasons: async (): Promise<AfterSaleReasonStat[]> => {
    await delay()
    return [
      { reasonCode: 'taste_issue', count: 6, amount: 860 },
      { reasonCode: 'quality_issue', count: 4, amount: 1180 },
      { reasonCode: 'wrong_goods', count: 3, amount: 520 },
      { reasonCode: 'price_adjustment', count: 2, amount: 120 },
    ]
  },
}

// ─── 商品 ─────────────────────────────────────────────
export const productApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: Product[]; total: number }> => {
    await delay()
    console.log('getProducts params:', params)
    const list: Product[] = [
      { id: 1, name: '西湖龙井 2026 春茶', sku: 'LJ-2026-001', unit: '斤', costPrice: 88, sellPrice: 128, stockQty: 45, safeStock: 10, status: 1, teaType: '绿茶', origin: '浙江杭州', year: 2026, season: '春茶', shelfLife: 18, createdAt: '2026-03-01' },
      { id: 2, name: '武夷山大红袍', sku: 'DHB-2026-001', unit: '斤', costPrice: 98, sellPrice: 160, stockQty: 28, safeStock: 8, status: 1, teaType: '乌龙茶', origin: '福建武夷山', year: 2026, createdAt: '2026-03-05' },
      { id: 3, name: '云南普洱饼茶', sku: 'PY-2022-001', unit: '饼', costPrice: 45, sellPrice: 100, stockQty: 120, safeStock: 20, status: 1, teaType: '普洱', origin: '云南勐海', year: 2022, shelfLife: 0, createdAt: '2026-02-10' },
      { id: 4, name: '白毫银针 特级', sku: 'BH-2026-001', unit: '克', costPrice: 160, sellPrice: 200, stockQty: 3, safeStock: 10, status: 1, teaType: '白茶', origin: '福建福鼎', year: 2026, shelfLife: 24, createdAt: '2026-03-15' },
      { id: 5, name: '铁观音清香型', sku: 'TGY-2026-001', unit: '斤', costPrice: 68, sellPrice: 100, stockQty: 35, safeStock: 10, status: 1, teaType: '乌龙茶', origin: '福建安溪', year: 2026, createdAt: '2026-03-10' },
      { id: 6, name: '正山小种红茶', sku: 'ZX-2026-001', unit: '斤', costPrice: 88, sellPrice: 130, stockQty: 22, safeStock: 8, status: 1, teaType: '红茶', origin: '福建桐木关', year: 2026, createdAt: '2026-03-08' },
    ]
    return { list, total: list.length }
  },
  get: async (id: number): Promise<Product> => {
    await delay()
    const res = await productApi.list({})
    const found = res.list.find((p) => p.id === id)
    if (!found) throw new Error('not found')
    return found
  },
  categories: async (): Promise<Category[]> => {
    await delay()
    return [
      { id: 1, name: '绿茶', children: [{ id: 11, name: '龙井', parentId: 1 }, { id: 12, name: '碧螺春', parentId: 1 }] },
      { id: 2, name: '红茶', children: [{ id: 21, name: '正山小种', parentId: 2 }] },
      { id: 3, name: '普洱', children: [{ id: 31, name: '生茶', parentId: 3 }, { id: 32, name: '熟茶', parentId: 3 }] },
      { id: 4, name: '白茶' },
      { id: 5, name: '乌龙茶', children: [{ id: 51, name: '铁观音', parentId: 5 }, { id: 52, name: '大红袍', parentId: 5 }] },
      { id: 6, name: '黄茶' },
      { id: 7, name: '黑茶' },
      { id: 8, name: '花茶' },
    ]
  },
  create: async (data: Partial<Product>) => { await delay(); console.log('create product:', data); return data },
  update: async (id: number, data: Partial<Product>) => { await delay(); console.log('update product:', id, data); return data },
  delete: async (id: number) => { await delay(); console.log('delete product:', id) },
}

// ─── 库存 ─────────────────────────────────────────────
export const stockApi = {
  records: async (): Promise<{ list: StockRecord[]; total: number }> => {
    await delay()
    const list: StockRecord[] = [
      { id: 1, productId: 1, productName: '西湖龙井 2026 春茶', type: 'in', reason: 'purchase', quantity: 50, beforeQty: 0, afterQty: 50, remark: '春茶到货', createdAt: '2026-03-01 08:00' },
      { id: 2, productId: 1, productName: '西湖龙井 2026 春茶', type: 'out', reason: 'sale', quantity: 5, beforeQty: 50, afterQty: 45, remark: '销售出库', createdAt: '2026-03-05 14:30' },
      { id: 3, productId: 3, productName: '云南普洱饼茶', type: 'in', reason: 'purchase', quantity: 120, beforeQty: 0, afterQty: 120, remark: '采购入库', createdAt: '2026-02-15 10:00' },
      { id: 4, productId: 4, productName: '白毫银针 特级', type: 'out', reason: 'sale', quantity: 7, beforeQty: 10, afterQty: 3, createdAt: '2026-03-20 09:00' },
    ]
    return { list, total: list.length }
  },
  in: async (data: Partial<StockRecord>) => { await delay(); console.log('stock in:', data) },
  out: async (data: Partial<StockRecord>) => { await delay(); console.log('stock out:', data) },
  warnings: async (): Promise<StockWarning[]> => dashboardApi.stockWarnings(),
}

// ─── 客户 ─────────────────────────────────────────────
export const customerApi = {
  list: async (): Promise<{ list: Customer[]; total: number }> => {
    await delay()
    const list: Customer[] = [
      { id: 1, name: '杭州茶庄', contactName: '张三', phone: '13800138001', address: '杭州市西湖区龙井路1号', receivableAmount: 5200, totalAmount: 38000, createdAt: '2026-01-10' },
      { id: 2, name: '福建茶叶批发行', contactName: '李四', phone: '13900139001', address: '福州市鼓楼区茶厂路88号', receivableAmount: 12000, totalAmount: 95000, createdAt: '2026-01-15' },
      { id: 3, name: '云南普洱经销商', contactName: '王五', phone: '18800188001', address: '昆明市盘龙区', receivableAmount: 0, totalAmount: 28000, createdAt: '2026-02-01' },
    ]
    return { list, total: list.length }
  },
  create: async (data: Partial<Customer>) => { await delay(); console.log('create customer:', data) },
  update: async (id: number, data: Partial<Customer>) => { await delay(); console.log('update customer:', id, data) },
}

// ─── 供应商 ─────────────────────────────────────────────
export const supplierApi = {
  list: async (): Promise<{ list: Supplier[]; total: number }> => {
    await delay()
    const list: Supplier[] = [
      { id: 1, name: '西湖龙井茶叶合作社', contactName: '陈掌柜', phone: '13700137001', address: '浙江杭州西湖区', supplyCategory: '绿茶', paymentTerms: '月结30天', createdAt: '2025-12-01' },
      { id: 2, name: '勐海普洱茶厂', contactName: '岩茶', phone: '18700187001', address: '云南西双版纳勐海县', supplyCategory: '普洱茶', paymentTerms: '30天账期', createdAt: '2025-11-15' },
      { id: 3, name: '福建武夷岩茶厂', contactName: '陆老板', phone: '13600136001', address: '福建南平武夷山市', supplyCategory: '乌龙茶', paymentTerms: '现结', createdAt: '2026-01-05' },
    ]
    return { list, total: list.length }
  },
  create: async (data: Partial<Supplier>) => { await delay(); console.log('create supplier:', data) },
  update: async (id: number, data: Partial<Supplier>) => { await delay(); console.log('update supplier:', id, data) },
}

// ─── 采购订单 ─────────────────────────────────────────
export const purchaseOrderApi = {
  list: async (): Promise<{ list: PurchaseOrder[]; total: number }> => {
    await delay()
    const list: PurchaseOrder[] = [
      { id: 1, orderNo: 'CG20260301001', supplierId: 1, supplierName: '西湖龙井茶叶合作社', totalAmount: 8800, paidAmount: 8800, returnedAmount: 0, status: 'done', createdAt: '2026-03-01' },
      { id: 2, orderNo: 'CG20260310001', supplierId: 2, supplierName: '勐海普洱茶厂', totalAmount: 5400, paidAmount: 0, returnedAmount: 0, status: 'stocked', createdAt: '2026-03-10' },
      { id: 3, orderNo: 'CG20260320001', supplierId: 3, supplierName: '福建武夷岩茶厂', totalAmount: 9600, paidAmount: 5000, returnedAmount: 0, status: 'draft', createdAt: '2026-03-20' },
    ]
    return { list, total: list.length }
  },
  create: async (data: Partial<PurchaseOrder>) => { await delay(); console.log('create purchase order:', data) },
  stockIn: async (id: number, remark?: string) => { await delay(); console.log('stock in order:', id, remark) },
}

// ─── 销售订单 ─────────────────────────────────────────
export const saleOrderApi = {
  list: async (): Promise<{ list: SaleOrder[]; total: number }> => {
    await delay()
    const list: SaleOrder[] = [
      { id: 1, orderNo: 'XS20260401001', customerId: 1, customerName: '杭州茶庄', totalAmount: 3840, receivedAmount: 3840, returnedAmount: 0, status: 'done', createdAt: '2026-04-01 09:30' },
      { id: 2, orderNo: 'XS20260402001', customerId: 2, customerName: '福建茶叶批发行', totalAmount: 12800, receivedAmount: 6400, returnedAmount: 0, status: 'shipped', createdAt: '2026-04-02 14:00' },
      { id: 3, orderNo: 'XS20260403001', totalAmount: 1280, receivedAmount: 1280, returnedAmount: 0, status: 'done', remark: '门店散客', createdAt: '2026-04-03 10:15' },
    ]
    return { list, total: list.length }
  },
  create: async (data: Partial<SaleOrder>) => { await delay(); console.log('create sale order:', data) },
}

// ─── 收付款 ─────────────────────────────────────────────
export const paymentApi = {
  list: async (): Promise<{ list: PaymentRecord[]; total: number }> => {
    await delay()
    const list: PaymentRecord[] = [
      { id: 1, type: 'receive', relatedType: 'sale_order', relatedId: 1, orderNo: 'XS20260401001', amount: 3840, method: '微信', createdAt: '2026-04-01' },
      { id: 2, type: 'pay', relatedType: 'purchase_order', relatedId: 1, orderNo: 'CG20260301001', amount: 8800, method: '转账', createdAt: '2026-03-15' },
      { id: 3, type: 'receive', relatedType: 'sale_order', relatedId: 2, orderNo: 'XS20260402001', amount: 6400, method: '支付宝', createdAt: '2026-04-02' },
      { id: 4, type: 'refund', relatedType: 'sale_order', relatedId: 2, orderNo: 'XS20260402001', amount: 320, method: '微信', createdAt: '2026-04-04' },
      { id: 5, type: 'supplier_refund', relatedType: 'purchase_order', relatedId: 2, orderNo: 'CG20260310001', amount: 500, method: '转账', createdAt: '2026-04-05' },
    ]
    return { list, total: list.length }
  },
  create: async (data: Partial<PaymentRecord>) => { await delay(); console.log('create payment:', data) },
}

// ─── 系统 ─────────────────────────────────────────────
export const systemApi = {
  users: async (): Promise<{ list: SysUser[]; total: number }> => {
    await delay()
    const list: SysUser[] = [
      { id: 1, username: 'admin', realName: '系统管理员', role: 'admin', status: 1, phone: '13800138000', createdAt: '2026-01-01' },
      { id: 2, username: 'manager01', realName: '张店长', role: 'manager', status: 1, phone: '13800138001', createdAt: '2026-01-05' },
      { id: 3, username: 'staff01', realName: '王店员', role: 'staff', status: 1, phone: '13800138002', createdAt: '2026-02-01' },
    ]
    return { list, total: list.length }
  },
  createUser: async (data: Partial<SysUser>) => { await delay(); console.log('create user:', data) },
  updateUser: async (id: number, data: Partial<SysUser>) => { await delay(); console.log('update user:', id, data) },
  toggleStatus: async (id: number, status: number) => { await delay(); console.log('toggle status:', id, status) },
  logs: async (): Promise<{ list: OperationLog[]; total: number }> => {
    await delay()
    const list: OperationLog[] = [
      { id: 1, operatorId: 1, realName: '系统管理员', module: 'product', action: 'create_product', detail: '西湖龙井 2026 春茶', createdAt: '2026-04-05 08:30' },
      { id: 2, operatorId: 2, realName: '张店长', module: 'sale', action: 'create_order', detail: 'XS20260401001', createdAt: '2026-04-01 09:30' },
      { id: 3, operatorId: 1, realName: '系统管理员', module: 'system', action: 'update_settings', detail: '修改店铺名称', createdAt: '2026-03-28 14:00' },
    ]
    return { list, total: list.length }
  },
  getSettings: async () => {
    await delay()
    return { shopName: '茶掌柜示例门店', aiProvider: 'qwen', aiIndustry: 'tea' }
  },
  updateSettings: async (data: Record<string, unknown>) => { await delay(); console.log('update settings:', data) },
}
