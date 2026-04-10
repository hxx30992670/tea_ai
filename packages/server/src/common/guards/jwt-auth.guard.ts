/**
 * JWT 鉴权守卫
 * 拦截所有需要登录的请求，验证 Bearer Token 并解析用户信息
 * 支持通过 @Public() 装饰器标记公开接口跳过鉴权
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // 检查路由或控制器是否标记了 @Public()，公开接口跳过鉴权
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    // 从请求头中提取 Token
    const token = this.extractToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('未登录或 token 无效');
    }

    try {
      // 验证 Token 并解析用户信息，挂载到 request 对象
      request.user = this.jwtService.verify<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      return true;
    } catch {
      throw new UnauthorizedException('登录状态已失效');
    }
  }

  /** 从 Authorization 请求头中提取 Bearer Token */
  private extractToken(authorization?: string) {
    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
