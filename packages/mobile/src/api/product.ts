import request from './index'
import type { ApiResponse, PageResult, Product } from '@/types'

export const productApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: Product[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<Product>>>('/products', { params })
    return res.data
  },

  /**
   * 按条码或 SKU 查找商品
   * 优先精确匹配 barcode，找不到再用 keyword 模糊匹配 SKU/名称
   */
  findByCode: async (code: string): Promise<Product | null> => {
    // 第一步：按 barcode 精确查
    const r1 = await request.get<never, ApiResponse<PageResult<Product>>>('/products', {
      params: { barcode: code, pageSize: 1 },
    })
    if (r1.data.list.length) return r1.data.list[0]

    // 第二步：按 keyword（匹配 SKU / 名称）再查一次
    const r2 = await request.get<never, ApiResponse<PageResult<Product>>>('/products', {
      params: { keyword: code, pageSize: 5 },
    })
    // 优先返回 SKU 完全一致的
    return (
      r2.data.list.find((p) => p.sku.toLowerCase() === code.toLowerCase()) ??
      r2.data.list[0] ??
      null
    )
  },

  search: async (keyword: string): Promise<Product[]> => {
    const res = await request.get<never, ApiResponse<PageResult<Product>>>('/products', {
      params: { keyword, pageSize: 20 },
    })
    return res.data.list
  },
}
