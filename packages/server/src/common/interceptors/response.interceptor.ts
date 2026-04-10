/**
 * 全局响应拦截器
 * 将所有成功响应统一包装为 { code: 200, message: 'success', data: ... } 格式
 * 便于前端统一处理响应结构
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, { code: number; message: string; data: T }>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ code: number; message: string; data: T }> {
    return next.handle().pipe(
      map((data) => ({
        code: 200,          // 业务状态码：200 表示成功
        message: 'success', // 提示信息
        data,               // 实际业务数据
      })),
    );
  }
}
