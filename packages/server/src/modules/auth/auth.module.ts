/**
 * 认证模块
 * 注册 JWT 模块、用户实体，并将 JwtAuthGuard 和 RolesGuard 注册为全局守卫
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { SystemModule } from '../system/system.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.register({}),  // JWT 模块（密钥在 Service 中动态使用）
    TypeOrmModule.forFeature([SysUserEntity]),  // 注册用户实体
    SystemModule,  // 引入系统模块用于操作日志记录
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // 注册 JWT 鉴权守卫为全局守卫
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 注册角色权限守卫为全局守卫
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService],  // 导出 AuthService 供其他模块使用
})
export class AuthModule {}
