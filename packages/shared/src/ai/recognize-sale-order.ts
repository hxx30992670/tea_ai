export interface RecognizeCatalogProduct {
  id: number
  name: string
  teaType?: string
  year?: string
  spec?: string
  sellPrice?: number
  unit?: string
  packageUnit?: string
  matchText?: string
  keywords?: string[]
}

export interface RecognizeProductLike {
  id: number
  name: string
  teaType?: string
  year?: string | number
  spec?: string
  sellPrice?: number
  unit?: string
  packageUnit?: string
  matchText?: string
  keywords?: string[]
  packageSize?: number
  origin?: string
  batchNo?: string
  season?: string
  remark?: string
  categoryName?: string
  categoryPath?: string[]
  extData?: Record<string, unknown>
}

export interface RecognizedSaleItemLike {
  customerName?: string | null
  lineText?: string | null
  productName: string
  productId: number | null
  quantity: number | null
  quantityUnit: string | null
  subtotal?: number | null
  unitPrice: number | null
}

export interface RecognizedSaleOrderLike<TItem extends RecognizedSaleItemLike = RecognizedSaleItemLike> {
  customerName: string | null
  items: TItem[]
}

const RECOGNIZE_HINT_IGNORED_EXT_KEYS = new Set([
  'teaType',
  'year',
  'unit',
  'packageUnit',
  'packageSize',
  'safeStock',
  'barcode',
  'imageUrl',
  'sellPrice',
  'costPrice',
  'stockQty',
  'status',
  'name',
  'sku',
])

function normalizeRecognizeKeyword(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function collectRecognizeHints(value: unknown, collector: Set<string>) {
  if (typeof value === 'string') {
    const normalized = normalizeRecognizeKeyword(value)
    if (normalized) collector.add(normalized)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectRecognizeHints(item, collector))
    return
  }

  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectRecognizeHints(item, collector))
  }
}

export function normalizeRecognizeSourceText(value?: string | null) {
  return String(value ?? '')
    .trim()
    .replace(/[\s，,。．、:：;；/\\|（）()【】\[\]"'`]+/g, '')
    .toLowerCase()
}

export function getProductRecognizeHints<TProduct extends RecognizeProductLike>(product: TProduct) {
  const hints = new Set<string>()
  const push = (value: unknown) => {
    const normalized = normalizeRecognizeKeyword(value)
    if (normalized) hints.add(normalized)
  }

  push(product.origin)
  push(product.batchNo)
  push(product.spec)
  push(product.season)
  push(product.remark)
  push(product.categoryName)
  if (Array.isArray(product.categoryPath)) {
    product.categoryPath.forEach((item) => push(item))
  }

  Object.entries(product.extData ?? {}).forEach(([key, value]) => {
    if (RECOGNIZE_HINT_IGNORED_EXT_KEYS.has(key)) return
    collectRecognizeHints(value, hints)
  })

  return [...hints]
}

export function buildRecognizeProductCatalog<TProduct extends RecognizeProductLike>(products: TProduct[]): RecognizeCatalogProduct[] {
  return products.map((product) => {
    const hints = getProductRecognizeHints(product)
    return {
      id: product.id,
      name: product.name,
      ...(product.teaType ? { teaType: product.teaType } : {}),
      ...(product.year != null ? { year: String(product.year) } : {}),
      ...(product.spec ? { spec: product.spec } : {}),
      ...(product.sellPrice != null ? { sellPrice: product.sellPrice } : {}),
      ...(product.unit ? { unit: product.unit } : {}),
      ...(product.packageUnit ? { packageUnit: product.packageUnit } : {}),
      ...(hints.length > 0 ? { matchText: hints.join(' / '), keywords: hints } : {}),
    }
  })
}

export function normalizeRecognizedAmount<TItem extends RecognizedSaleItemLike>(item: TItem) {
  const rawLineText = item.lineText ?? ''
  const normalizedLineText = rawLineText.replace(/\s+/g, '')

  if (normalizedLineText.includes('一斤半')) {
    return { quantity: 1.5, quantityUnit: '斤' }
  }

  if (normalizedLineText.includes('半斤')) {
    return { quantity: 0.5, quantityUnit: '斤' }
  }

  if (normalizedLineText.includes('半两')) {
    return { quantity: 0.5, quantityUnit: '两' }
  }

  return {
    quantity: item.quantity ?? undefined,
    quantityUnit: item.quantityUnit ?? '',
  }
}

export function parsePossibleCustomerName(lineText?: string | null) {
  const text = (lineText ?? '').trim()
  if (!text) return undefined
  const firstCell = text.split(/[\s,，\t|/\\]+/).find(Boolean)
  if (!firstCell) return undefined
  const candidate = firstCell.replace(/[:：]/g, '').trim()
  if (!candidate) return undefined
  if (/^(姓名|客户|联系人|产品|商品|价格|单价|数量|小计)$/i.test(candidate)) return undefined
  if (/\d/.test(candidate) || candidate.length < 2 || candidate.length > 8) return undefined
  return candidate
}

export function collectRecognizedCustomerNames<TItem extends RecognizedSaleItemLike>(
  recognized: RecognizedSaleOrderLike<TItem>,
) {
  const names: string[] = []
  if (recognized.customerName) names.push(recognized.customerName)
  for (const item of recognized.items) {
    if (item.customerName) names.push(item.customerName)
    const parsed = parsePossibleCustomerName(item.lineText)
    if (parsed) names.push(parsed)
  }

  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
}

export function isUnitMatched<TProduct extends RecognizeProductLike>(quantityUnit: string, product?: TProduct) {
  if (!quantityUnit || !product) return true
  const packageUnit = product.packageUnit ?? ''
  const baseUnit = product.unit ?? ''
  return quantityUnit === packageUnit
    || quantityUnit === baseUnit
    || (packageUnit ? quantityUnit.includes(packageUnit) || packageUnit.includes(quantityUnit) : false)
    || (baseUnit ? quantityUnit.includes(baseUnit) || baseUnit.includes(quantityUnit) : false)
}

export function normalizePriceToProductBaseUnit<TProduct extends RecognizeProductLike>(
  unitPrice: number,
  quantityUnit: string,
  product?: TProduct,
) {
  if (!product) return unitPrice
  const packageUnit = product.packageUnit ?? ''
  const packageSize = product.packageSize ?? 0
  const recognizedAsPackage = quantityUnit
    && packageUnit
    && (quantityUnit === packageUnit || quantityUnit.includes(packageUnit) || packageUnit.includes(quantityUnit))
  if (recognizedAsPackage && packageSize > 0) {
    return Number((unitPrice / packageSize).toFixed(2))
  }
  return unitPrice
}

function extractRecognizeDescriptorText<TItem extends RecognizedSaleItemLike>(item: TItem) {
  const rawText = (item.lineText ?? '').replace(/\s+/g, '')
  if (!rawText) return normalizeRecognizeSourceText(item.productName)

  let text = rawText
  const customerText = normalizeRecognizeSourceText(item.customerName)
  if (customerText && text.startsWith(customerText)) {
    text = text.slice(customerText.length)
  }

  const actionMatch = text.match(/(?:购买|买|订|要|拿|提)(.+)$/)
  if (actionMatch?.[1]) {
    text = actionMatch[1]
  }

  const quantityIndex = text.search(/(一斤半|半斤|半两|\d+(?:\.\d+)?(?:斤|两|g|克|饼|提|件|包|盒|袋|罐|箱|公斤))/i)
  if (quantityIndex > 0) {
    text = text.slice(0, quantityIndex)
  }

  const priceIndex = text.search(/\d+(?:\.\d+)?(?:元|块)/)
  if (priceIndex > 0) {
    text = text.slice(0, priceIndex)
  }

  const normalized = normalizeRecognizeSourceText(text)
  return normalized || normalizeRecognizeSourceText(item.productName)
}

function getRecognizeHintTokens<TProduct extends RecognizeProductLike>(product: TProduct) {
  const tokens = new Set<string>()
  const rawHints = [
    ...getProductRecognizeHints(product),
    product.teaType,
    product.year != null ? String(product.year) : undefined,
    product.spec,
    product.packageUnit,
    product.unit,
  ]

  for (const hint of rawHints) {
    const normalized = normalizeRecognizeSourceText(hint)
    if (!normalized) continue
    tokens.add(normalized)

    if (/^[\u4e00-\u9fa5]{3,8}$/.test(normalized)) {
      for (let size = 2; size <= Math.min(4, normalized.length); size += 1) {
        for (let index = 0; index <= normalized.length - size; index += 1) {
          tokens.add(normalized.slice(index, index + size))
        }
      }
    }
  }

  return [...tokens].filter((token) => token.length >= 2)
}

function getRecognizeHintScore<TProduct extends RecognizeProductLike>(sourceText: string, product: TProduct) {
  if (!sourceText) return 0

  let total = 0
  for (const hint of getProductRecognizeHints(product)) {
    const normalizedHint = normalizeRecognizeSourceText(hint)
    if (!normalizedHint || normalizedHint.length < 2) continue
    if (!sourceText.includes(normalizedHint)) continue

    if (normalizedHint.length >= 6) total += 6
    else if (normalizedHint.length >= 4) total += 4
    else total += 2
  }

  return Math.min(total, 12)
}

function getRecognizeDistinctHintScore<TProduct extends RecognizeProductLike>(
  sourceText: string,
  product: TProduct,
  sameNameCandidates: TProduct[],
) {
  if (!sourceText || sameNameCandidates.length <= 1) return 0

  const currentTokens = new Set(getRecognizeHintTokens(product))
  if (currentTokens.size === 0) return 0

  const siblingTokens = new Set<string>()
  sameNameCandidates.forEach((candidate) => {
    if (candidate.id === product.id) return
    getRecognizeHintTokens(candidate).forEach((token) => siblingTokens.add(token))
  })

  let total = 0
  currentTokens.forEach((token) => {
    if (siblingTokens.has(token) || !sourceText.includes(token)) return
    if (token.length >= 4) total += 8
    else if (token.length === 3) total += 6
    else total += 4
  })

  return total
}

function isRecognizeSameNameFamily(recognizedName: string, productName: string) {
  const left = normalizeRecognizeSourceText(recognizedName)
  const right = normalizeRecognizeSourceText(productName)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

export function pickBestRecognizedProduct<TProduct extends RecognizeProductLike, TItem extends RecognizedSaleItemLike>(
  item: TItem,
  products: TProduct[],
  productMap: Map<number, TProduct>,
  quantity: number | undefined,
  quantityUnit: string,
) {
  const name = (item.productName ?? '').trim()
  const lineText = (item.lineText ?? '').replace(/\s+/g, '')
  const recognizeSourceText = normalizeRecognizeSourceText(`${name} ${item.lineText ?? ''}`)
  const recognizeDescriptorText = extractRecognizeDescriptorText(item)
  const byId = item.productId != null ? productMap.get(item.productId) : undefined
  const byName = name
    ? products.filter((product) => name.includes(product.name) || product.name.includes(name))
    : []
  const byHint = !byId && byName.length === 0 && recognizeSourceText
    ? products.filter((product) => getRecognizeHintScore(recognizeSourceText, product) > 0)
    : []

  const candidateMap = new Map<number, TProduct>()
  if (byId) candidateMap.set(byId.id, byId)
  byName.forEach((product) => candidateMap.set(product.id, product))
  byHint.forEach((product) => candidateMap.set(product.id, product))
  const candidates = [...candidateMap.values()]
  if (candidates.length === 0) return undefined

  const unitCandidates = quantityUnit ? candidates.filter((product) => isUnitMatched(quantityUnit, product)) : candidates
  const pool = unitCandidates.length > 0 ? unitCandidates : candidates
  const sameNameCandidates = pool.filter((product) => isRecognizeSameNameFamily(name || byId?.name || '', product.name))
  const hasDistinctHint = sameNameCandidates.some((product) => getRecognizeDistinctHintScore(recognizeDescriptorText, product, sameNameCandidates) > 0)

  if (sameNameCandidates.length > 1 && !hasDistinctHint && !byId) {
    return undefined
  }

  const rawUnitPrice = item.subtotal != null && quantity != null && quantity > 0
    ? Number((item.subtotal / quantity).toFixed(2))
    : (item.unitPrice ?? undefined)

  const score = (product: TProduct) => {
    let total = 0
    const distinctHintScore = getRecognizeDistinctHintScore(recognizeDescriptorText, product, sameNameCandidates)
    const isSameNameConflict = sameNameCandidates.length > 1 && sameNameCandidates.some((candidate) => candidate.id === product.id)

    if (isSameNameConflict && hasDistinctHint) {
      if (distinctHintScore > 0) total += 100 + distinctHintScore
    } else if (byId?.id === product.id) {
      total += isSameNameConflict ? 1 : 3
    }

    if (name && name === product.name) total += 4
    else if (name && (name.includes(product.name) || product.name.includes(name))) total += 2
    if (quantityUnit && isUnitMatched(quantityUnit, product)) total += 4
    if (product.year != null && lineText.includes(String(product.year))) total += 4
    if (product.teaType && lineText.includes(product.teaType)) total += 2
    total += getRecognizeHintScore(recognizeSourceText, product)
    total += distinctHintScore

    if (!hasDistinctHint && rawUnitPrice != null && product.sellPrice != null && product.sellPrice > 0) {
      const normalized = normalizePriceToProductBaseUnit(rawUnitPrice, quantityUnit, product)
      const ratioDiff = Math.abs(normalized - product.sellPrice) / product.sellPrice
      if (ratioDiff <= 0.05) total += 3
      else if (ratioDiff <= 0.2) total += 2
      else if (ratioDiff <= 0.5) total += 1
      else if (ratioDiff > 1) total -= 1
    }

    return total
  }

  return pool
    .slice()
    .sort((left, right) => score(right) - score(left) || left.id - right.id)[0]
}
