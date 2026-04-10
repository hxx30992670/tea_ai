export const ROLE_ADMIN = 'admin';
export const ROLE_MANAGER = 'manager';
export const ROLE_STAFF = 'staff';

export const ROLE_DEFINITIONS = {
  [ROLE_ADMIN]: {
    code: ROLE_ADMIN,
    name: '老板',
    description: '系统最高权限，管理财务、AI 与系统设置',
  },
  [ROLE_MANAGER]: {
    code: ROLE_MANAGER,
    name: '店长/主管',
    description: '负责日常业务运营和进销存流程',
  },
  [ROLE_STAFF]: {
    code: ROLE_STAFF,
    name: '店员/销售',
    description: '负责扫码销售、库存查询和简单客户录入',
  },
} as const;

export const APP_ROLES = Object.keys(ROLE_DEFINITIONS);

export type AppRole = keyof typeof ROLE_DEFINITIONS;

export function isAppRole(role: string): role is AppRole {
  return APP_ROLES.includes(role);
}

export function getRoleProfile(role: string) {
  return ROLE_DEFINITIONS[role as AppRole] ?? null;
}
