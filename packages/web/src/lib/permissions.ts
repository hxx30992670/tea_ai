import type { UserInfo } from '@/types'

type AppRole = UserInfo['role']

const WEB_ROLE_ACCESS: Record<AppRole, string[]> = {
  admin: [
    '/',
    '/products',
    '/stock',
    '/purchase',
    '/sale',
    '/customers',
    '/suppliers',
    '/payments',
    '/ai',
    '/system/users',
    '/system/logs',
    '/system/settings',
    '/account/password',
  ],
  manager: ['/', '/products', '/stock', '/purchase', '/sale', '/customers', '/suppliers', '/payments', '/account/password'],
  staff: ['/', '/sale', '/account/password'],
}

export function canAccessWebPath(role: AppRole | undefined, pathname: string) {
  if (!role) return false
  return WEB_ROLE_ACCESS[role].includes(pathname)
}

export function canShowWebMenuPath(role: AppRole | undefined, pathname: string) {
  if (!role) return false
  return canAccessWebPath(role, pathname)
}

export function getWebDefaultPath(role: AppRole | undefined) {
  if (role === 'admin') return '/'
  return '/sale'
}

export function canUseAiChat(role: AppRole | undefined) {
  return role === 'admin'
}

export function canUseAiRecognize(role: AppRole | undefined) {
  return role === 'admin' || role === 'manager'
}
