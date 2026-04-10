/**
 * 公开接口装饰器
 * 用于标记不需要 JWT 鉴权的路由或控制器
 * 用法：@Public() 放在 Controller 方法或类级别
 */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
