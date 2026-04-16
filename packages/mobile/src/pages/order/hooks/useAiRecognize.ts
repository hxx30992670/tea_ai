import { useState, useCallback } from 'react'
import { aiApi } from '@/api/ai'
import { productApi } from '@/api/product'
import { customerApi } from '@/api/customer'
import {
  buildRecognizeProductCatalog,
  collectRecognizedCustomerNames,
  normalizePriceToProductBaseUnit,
  normalizeRecognizedAmount,
  pickBestRecognizedProduct,
} from '@shared/ai/recognize-sale-order'
import { useOrderDraftStore } from '@/store/order-draft'
import type { Product, Customer } from '@/types'
import type { AiRecognizeProduct, AiRecognizedSaleOrder } from '@/api/ai'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_TEXT_SIZE = 500 * 1024
const MAX_IMAGE_DIMENSION = 3072
const MIN_IMAGE_DIMENSION = 1600
const INITIAL_JPEG_QUALITY = 0.95
const MIN_JPEG_QUALITY = 0.78
const DIRECT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** 简易客户名匹配（与 web 端 customerMatching.ts 逻辑对齐） */
function normalizeEntityName(value?: string | null) {
  return (value ?? '')
    .trim()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/有限公司|有限责任公司|股份有限公司|公司|集团|科技|贸易|实业|商行|茶业|茶行|茶厂|门市部|经营部/g, '')
    .replace(/省|市|区|县|镇/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function buildNameVariants(value?: string | null) {
  const normalized = normalizeEntityName(value)
  if (!normalized) return [] as string[]
  const variants = new Set<string>([normalized])
  if (normalized.length >= 2) {
    variants.add(normalized.slice(0, Math.min(normalized.length, 4)))
    variants.add(normalized.slice(-Math.min(normalized.length, 4)))
  }
  return [...variants].filter((item) => item.length >= 2)
}

function matchCustomer(recognizedName: string, customers: Customer[]): Customer | undefined {
  const trimmed = recognizedName.trim()
  if (!trimmed) return undefined

  let best: Customer | undefined
  let bestScore = 0
  const phoneKeyword = trimmed.replace(/\D/g, '')
  const keywordVariants = buildNameVariants(trimmed)

  for (const customer of customers) {
    let score = 0
    const customerPhone = (customer.phone ?? '').replace(/\D/g, '')
    if (phoneKeyword.length >= 6 && customerPhone.includes(phoneKeyword)) {
      score = Math.max(score, 10)
    }

    const customerVariants = buildNameVariants(customer.name)
    const contactVariants = buildNameVariants(customer.contactName)
    if (keywordVariants.some((item) => customerVariants.some((variant) => item.includes(variant) || variant.includes(item)))) {
      score = Math.max(score, 6)
    }
    if (keywordVariants.some((item) => contactVariants.some((variant) => item.includes(variant) || variant.includes(item)))) {
      score = Math.max(score, 8)
    }
    if (trimmed === customer.name || trimmed === customer.contactName) {
      score = Math.max(score, 12)
    }

    if (score > bestScore) {
      bestScore = score
      best = customer
    }
  }

  return bestScore > 0 ? best : undefined
}

function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|bmp|gif|heic|heif)$/i.test(file.name)
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败，请换一张图片重试'))
    image.src = dataUrl
  })
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function buildImageAttachment(content: string, mimeType: string | undefined, filename: string) {
  return {
    type: 'image' as const,
    content,
    mimeType,
    filename,
  }
}

function renderImageAsJpeg(image: HTMLImageElement, maxDimension: number, quality: number) {
  const ratio = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1))
  const width = Math.max(1, Math.round(image.width * ratio))
  const height = Math.max(1, Math.round(image.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('图片处理失败，请重试')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', quality)
}

async function normalizeImageAttachment(file: File) {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片读取失败，请重试'))
    reader.readAsDataURL(file)
  })

  const normalizedType = (file.type || '').toLowerCase()
  if (
    file.size <= MAX_IMAGE_SIZE
    && DIRECT_IMAGE_TYPES.has(normalizedType)
    && estimateDataUrlBytes(originalDataUrl) <= MAX_IMAGE_SIZE
  ) {
    return buildImageAttachment(originalDataUrl, normalizedType || undefined, file.name)
  }

  const image = await loadImageFromDataUrl(originalDataUrl)
  let maxDimension = Math.min(MAX_IMAGE_DIMENSION, Math.max(image.width || 1, image.height || 1))
  let quality = INITIAL_JPEG_QUALITY
  let content = renderImageAsJpeg(image, maxDimension, quality)

  while (estimateDataUrlBytes(content) > MAX_IMAGE_SIZE) {
    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, Number((quality - 0.06).toFixed(2)))
    } else if (maxDimension > MIN_IMAGE_DIMENSION) {
      maxDimension = Math.max(MIN_IMAGE_DIMENSION, Math.round(maxDimension * 0.88))
      quality = INITIAL_JPEG_QUALITY
    } else {
      break
    }

    content = renderImageAsJpeg(image, maxDimension, quality)
  }

  if (estimateDataUrlBytes(content) > MAX_IMAGE_SIZE) {
    throw new Error('图片体积过大，请裁剪后重试')
  }

  return buildImageAttachment(content, 'image/jpeg', file.name.replace(/\.[^.]+$/, '') + '.jpg')
}

async function readAttachment(file: File) {
  if (isImageFile(file)) {
    return normalizeImageAttachment(file)
  }

  if (file.size > MAX_TEXT_SIZE) {
    throw new Error('文件不能超过 500KB')
  }

  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败，请重试'))
    reader.readAsText(file)
  })

  return {
    type: 'text' as const,
    content,
    mimeType: file.type || undefined,
    filename: file.name,
  }
}

function getRecognizeErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const response = 'response' in error ? error.response : undefined
    if (response && typeof response === 'object') {
      const data = 'data' in response ? response.data : undefined
      if (data && typeof data === 'object') {
        const message = 'message' in data ? data.message : undefined
        if (typeof message === 'string' && message.trim()) return message
        if (Array.isArray(message)) {
          const joined = message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join('；')
          if (joined) return joined
        }

        const reason = 'reason' in data ? data.reason : undefined
        if (typeof reason === 'string' && reason.trim()) return reason
      }
    }

    const message = 'message' in error ? error.message : undefined
    if (typeof message === 'string' && message.trim()) {
      if (message.includes('timeout')) {
        return '识别超时，请重试或换一张更清晰的图片'
      }
      return message
    }
  }

  return '识别出错，请重试'
}

export function useAiRecognize() {
  const [recognizing, setRecognizing] = useState(false)
  const [progress, setProgress] = useState('')
  const store = useOrderDraftStore()

  const recognize = useCallback(async (file: File) => {
    setRecognizing(true)
    setProgress('正在读取文件…')
    try {
      // 1. 读取文件并把移动端图片统一转成 JPEG，减少 HEIC/超高分辨率带来的识别失败。
      const attachment = await readAttachment(file)

      // 2. 加载商品目录
      setProgress('正在加载商品目录…')
      const allProducts: Product[] = []
      let page = 1
      while (true) {
        const res = await productApi.list({ page, pageSize: 100 })
        allProducts.push(...res.list)
        if (allProducts.length >= res.total) break
        page++
      }
      const productMap = new Map(allProducts.map((p) => [p.id, p]))

      const catalog: AiRecognizeProduct[] = buildRecognizeProductCatalog(allProducts)

      // 3. 调用 AI 识别
      setProgress('AI 正在识别…')
      const res = await aiApi.recognizeSaleOrder(attachment, catalog)

      if (!res.ok || !res.data) {
        return { ok: false, message: res.reason ?? '识别失败，请换一张更清晰的图片' }
      }

      const recognized = res.data

      // 4. 匹配客户
      setProgress('正在匹配客户…')
      const candidateNames = collectRecognizedCustomerNames(recognized)
      if (candidateNames.length > 0) {
        const allCustomers: Customer[] = []
        let customerPage = 1
        while (true) {
          const custRes = await customerApi.list({ page: customerPage, pageSize: 100 })
          allCustomers.push(...custRes.list)
          if (allCustomers.length >= custRes.total) break
          customerPage++
        }
        for (const name of candidateNames) {
          const matched = matchCustomer(name, allCustomers)
          if (matched) {
            store.setCustomer({ id: matched.id, name: matched.name, phone: matched.phone })
            break
          }
        }
      }

      // 5. 填充商品
      setProgress('正在填充商品…')
      let unmatchedCount = 0
      for (const item of recognized.items) {
        const normalizedAmount = normalizeRecognizedAmount(item)
        const qUnit = normalizedAmount.quantityUnit
        const qty = normalizedAmount.quantity
        const qtyValue = qty ?? 1
        const matched = pickBestRecognizedProduct(item, allProducts, productMap, qty, qUnit)

        if (!matched) { unmatchedCount++; continue }

        const pkgUnit = matched.packageUnit ?? ''
        const baseUnit = matched.unit ?? ''
        const isPackageUnit = pkgUnit && (qUnit === pkgUnit || qUnit.includes(pkgUnit) || pkgUnit.includes(qUnit))
        const isBaseUnit = baseUnit && (qUnit === baseUnit || qUnit.includes(baseUnit) || baseUnit.includes(qUnit))
        const packageSize = matched.packageSize ?? undefined

        let packageQty: number | undefined
        let looseQty: number | undefined
        let quantity: number | undefined

        if (pkgUnit) {
          if (isPackageUnit) {
            packageQty = qtyValue
          } else if (isBaseUnit) {
            looseQty = qtyValue
          } else {
            packageQty = qtyValue
          }
          quantity = (packageQty ?? 0) * (packageSize ?? 1) + (looseQty ?? 0)
        } else {
          looseQty = qtyValue
          quantity = qtyValue
        }

        const rawUnitPrice = item.subtotal != null && qty != null && qty > 0
          ? Number((item.subtotal / qty).toFixed(2))
          : (item.unitPrice ?? undefined)
        const aiUnitPrice = rawUnitPrice != null
          ? normalizePriceToProductBaseUnit(rawUnitPrice, qUnit, matched)
          : undefined

        store.addItem({
          productId: matched.id,
          productName: matched.name,
          spec: matched.spec,
          unit: matched.unit,
          packageUnit: matched.packageUnit,
          packageSize: matched.packageSize,
          packageQty,
          looseQty,
          quantity,
          unitPrice: aiUnitPrice ?? matched.sellPrice,
          sellPrice: matched.sellPrice,
        })
      }

      // 6. 备注和支付方式
      if (recognized.remark) store.setRemark(recognized.remark)
      if (recognized.paymentMethod) store.setMethod(recognized.paymentMethod)

      const total = recognized.items.length
      const filled = total - unmatchedCount
      if (unmatchedCount > 0) {
        return { ok: true, message: `已识别 ${total} 行商品，其中 ${unmatchedCount} 行未匹配，请手动添加` }
      }
      return { ok: true, message: `已识别并填入 ${filled} 行商品，请核对后提交` }
    } catch (error) {
      return { ok: false, message: getRecognizeErrorMessage(error) }
    } finally {
      setRecognizing(false)
      setProgress('')
    }
  }, [store])

  return { recognizing, progress, recognize }
}
