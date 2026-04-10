/**
 * 角色权限守卫
 * 配合 @Roles() 装饰器使用，校验当前登录用户是否具备访问该路由的角色权限
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 获取路由或控制器上通过 @Roles() 标记的 required roles
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 未标记角色要求的接口不限制访问
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const role = request.user?.role;

    // 校验用户角色是否在允许列表中
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('无权限访问该资源');
    }

    return true;
  }
}
