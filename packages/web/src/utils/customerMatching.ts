type MatchableCustomer = {
  id: number
  name: string
  contactName?: string
  phone?: string
}

export const normalizeEntityName = (value?: string | null) => (value ?? '')
  .trim()
  .replace(/[（(].*?[）)]/g, '')
  .replace(/有限公司|有限责任公司|股份有限公司|公司|集团|科技|贸易|实业|商行|茶业|茶行|茶厂|门市部|经营部/g, '')
  .replace(/省|市|区|县|镇/g, '')
  .replace(/\s+/g, '')
  .toLowerCase()

export const buildNameVariants = (value?: string | null) => {
  const normalized = normalizeEntityName(value)
  if (!normalized) return [] as string[]
  const variants = new Set<string>([normalized])
  if (normalized.length >= 2) {
    variants.add(normalized.slice(0, Math.min(normalized.length, 4)))
    variants.add(normalized.slice(-Math.min(normalized.length, 4)))
  }
  return [...variants].filter((item) => item.length >= 2)
}

export const scoreCustomerMatch = (keyword: string, customer: MatchableCustomer) => {
  const trimmed = keyword.trim()
  if (!trimmed) return 0

  let score = 0
  const phoneKeyword = trimmed.replace(/\D/g, '')
  const customerPhone = (customer.phone ?? '').replace(/\D/g, '')
  if (phoneKeyword.length >= 6 && customerPhone.includes(phoneKeyword)) {
    score = Math.max(score, 10)
  }

  const customerVariants = buildNameVariants(customer.name)
  const contactVariants = buildNameVariants(customer.contactName)
  const keywordVariants = buildNameVariants(trimmed)

  if (keywordVariants.some((item) => customerVariants.some((variant) => item.includes(variant) || variant.includes(item)))) {
    score = Math.max(score, 6)
  }

  if (keywordVariants.some((item) => contactVariants.some((variant) => item.includes(variant) || variant.includes(item)))) {
    score = Math.max(score, 8)
  }

  if (trimmed === customer.name || trimmed === customer.contactName) {
    score = Math.max(score, 12)
  }

  return score
}

export const matchCustomerByRecognizedName = <T extends MatchableCustomer>(recognizedName: string | null | undefined, customers: T[]) => {
  if (!recognizedName) return undefined
  const matched = customers
    .map((customer) => ({ customer, score: scoreCustomerMatch(recognizedName, customer) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.customer.id - b.customer.id)[0]
  return matched?.customer
}
