import type { UserInfo } from '@/types'

type AppRole = UserInfo['role']

const MOBILE_ROLE_ACCESS: Record<AppRole, string[]> = {
  admin: ['/', '/dashboard', '/scan', '/order', '/order/new', '/ai', '/profile'],
  manager: ['/', '/dashboard', '/scan', '/order', '/order/new', '/profile'],
  staff: ['/', '/dashboard', '/scan', '/order', '/order/new', '/profile'],
}

export function canAccessMobilePath(role: AppRole | undefined, pathname: string) {
  if (!role) return false
  return MOBILE_ROLE_ACCESS[role].includes(pathname)
}

export function canUseMobileAiChat(role: AppRole | undefined) {
  return role === 'admin'
}

export function canUseMobileAiRecognize(role: AppRole | undefined) {
  return role === 'admin' || role === 'manager'
}

export function getMobileDefaultPath() {
  return '/dashboard'
}
