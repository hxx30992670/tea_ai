/**
 * 商品 API 接口
 * 封装商品及分类的增删改查、元数据获取等请求
 */
import request from './index'
import type { ApiResponse, PageResult, Product, Category } from '@/types'

export interface ProductMetaField {
  key: string
  label: string
  type: 'input' | 'number' | 'select'
  source?: 'units' | 'seasons'
  options?: { value: string; label: string }[]
}

export interface ProductMeta {
  units: string[]
  seasons: string[]
  shelfLifePresets: Record<string, number>
  defaultExtFields: ProductMetaField[]
  categoryFieldPresets: Record<string, string[]>
}

export const productApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: Product[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<Product>>>('/products', { params })
    return res.data
  },

  get: async (id: number): Promise<Product> => {
    const res = await request.get<never, ApiResponse<Product>>(`/products/${id}`)
    return res.data
  },

  categories: async (): Promise<Category[]> => {
    const res = await request.get<never, ApiResponse<Category[]>>('/categories')
    return res.data
  },

  createCategory: async (data: Partial<Category>): Promise<Category> => {
    const res = await request.post<never, ApiResponse<Category>>('/categories', data)
    return res.data
  },

  meta: async (): Promise<ProductMeta> => {
    const res = await request.get<never, ApiResponse<ProductMeta>>('/products/meta')
    return res.data
  },

  generateSku: async (categoryId?: number): Promise<string> => {
    const params = categoryId ? { categoryId } : {}
    const res = await request.get<never, ApiResponse<string>>('/products/generate-sku', { params })
    return res.data
  },

  updateCategory: async (id: number, data: Partial<Category>): Promise<Category> => {
    const res = await request.put<never, ApiResponse<Category>>(`/categories/${id}`, data)
    return res.data
  },

  create: async (data: Partial<Product>): Promise<Product> => {
    const res = await request.post<never, ApiResponse<Product>>('/products', data)
    return res.data
  },

  update: async (id: number, data: Partial<Product>): Promise<Product> => {
    const res = await request.put<never, ApiResponse<Product>>(`/products/${id}`, data)
    return res.data
  },

  delete: async (id: number): Promise<void> => {
    await request.delete(`/products/${id}`)
  },
}
