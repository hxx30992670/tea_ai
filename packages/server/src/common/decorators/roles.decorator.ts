/**
 * 角色装饰器
 * 用于标记路由所需的角色权限，配合 RolesGuard 使用
 * 用法：@Roles('admin', 'manager') 仅允许管理员和店长访问
 */
import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../constants/roles';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
