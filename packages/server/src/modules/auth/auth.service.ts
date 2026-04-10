/**
 * 认证服务
 * 负责用户登录、Token 签发、密码修改等核心鉴权逻辑
 * 使用 bcrypt 加密存储密码，JWT 实现无状态认证
 */
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { getRoleProfile } from '../../common/constants/roles';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { AuthUser } from '../../common/types/auth-user.type';
import { OperationLogService } from '../system/operation-log.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
    private readonly jwtService: JwtService,
    private readonly operationLogService: OperationLogService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({ where: { username: dto.username } });

    if (!user || user.status !== 1) {
      throw new UnauthorizedException('账号不存在或已禁用');
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const authResponse = await this.buildAuthResponse(user);
    await this.operationLogService.createLog({
      module: 'auth',
      action: 'login',
      operatorId: user.id,
      detail: user.username,
    });

    return authResponse;
  }

  async refreshToken(refreshToken: string) {
    let payload: AuthUser;

    try {
      payload = this.jwtService.verify<AuthUser>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('用户不存在或已禁用');
    }

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('用户不存在或已禁用');
    }

    return this.toProfile(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('用户不存在或已禁用');
    }

    const matched = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('原密码错误');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.save(user);

    await this.operationLogService.createLog({
      module: 'auth',
      action: 'change_password',
      operatorId: user.id,
      detail: user.username,
    });

    return { success: true };
  }

  private async buildAuthResponse(user: SysUserEntity) {
    const payload: AuthUser = {
      sub: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '24h',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: this.toProfile(user),
    };
  }

  private toProfile(user: SysUserEntity) {
    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      phone: user.phone,
      role: user.role,
      roleProfile: getRoleProfile(user.role),
      status: user.status,
    };
  }
}
