/**
 * 当前用户参数装饰器
 * 用于 Controller 方法参数中直接获取已登录用户信息
 * 用法：@CurrentUser() user: AuthUser
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    return request.user;
  },
);
