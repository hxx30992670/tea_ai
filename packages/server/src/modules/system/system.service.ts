import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getRoleProfile, isAppRole, ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF } from '../../common/constants/roles';
import { DEMO_UNSUPPORTED_MESSAGE, isDemoDeployment } from '../../common/utils/deployment.util';
import { SystemSettingEntity } from '../../entities/system-setting.entity';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { AuthUser } from '../../common/types/auth-user.type';
import { OperationLogService } from './operation-log.service';
import { CreateUserDto } from './dto/create-user.dto';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';
import { UpdateSystemSettingsDto } from './dto/system-settings.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserQueryDto } from './dto/user-query.dto';

const SYSTEM_SETTING_KEYS = [
  'shopName',
  'aiApiKey',
  'aiProvider',
  'aiModelApiKey',
  'aiModelName',
  'aiModelBaseUrl',
  'aiPromptServiceUrl',
  'aiServiceUniqueId',
  'aiInstanceToken',
  'aiIndustry',
] as const;

export interface SpeechProviderConfig {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string;
  reason: string;
}

export interface SpeechCapabilities {
  enabled: boolean;
  provider: string;
  model: string;
  realtimeSupported: boolean;
  reason: string;
}

@Injectable()
export class SystemService {
  constructor(
    @InjectRepository(SystemSettingEntity)
    private readonly systemSettingRepository: Repository<SystemSettingEntity>,
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
    private readonly operationLogService: OperationLogService,
  ) {}

  /** 内部调用：返回全量设置，不做角色过滤（用于 AI 等内部服务） */
  async getAllSettings(): Promise<Record<string, string>> {
    const settings = await this.systemSettingRepository.find({
      where: SYSTEM_SETTING_KEYS.map((key) => ({ key })),
      order: { id: 'ASC' },
    });
    return SYSTEM_SETTING_KEYS.reduce<Record<string, string>>((result, key) => {
      const record = settings.find((item) => item.key === key);
      result[key] = record?.value ?? '';
      return result;
    }, {});
  }

  private isAiConfigured(settings: Record<string, string>) {
    return Boolean(
      settings.aiApiKey?.trim()
      && settings.aiPromptServiceUrl?.trim()
      && settings.aiProvider?.trim()
      && settings.aiModelApiKey?.trim()
      && settings.aiModelName?.trim()
      && settings.aiModelBaseUrl?.trim()
      && settings.aiServiceUniqueId?.trim(),
    );
  }

  private buildAiSettingsResponse(settings: Record<string, string>) {
    const aiConfigured = this.isAiConfigured(settings);

    return {
      shopName: settings.shopName,
      aiConfigured,
      aiProvider: aiConfigured ? settings.aiProvider : '',
      aiModelName: aiConfigured ? settings.aiModelName : '',
    };
  }

  private async upsertSetting(key: string, value: string | null) {
    const existing = await this.systemSettingRepository.findOne({ where: { key } });

    if (existing) {
      existing.value = value;
      await this.systemSettingRepository.save(existing);
      return;
    }

    const created = this.systemSettingRepository.create({ key, value });
    await this.systemSettingRepository.save(created);
  }

  async ensureAiServiceUniqueId() {
    const existing = await this.systemSettingRepository.findOne({ where: { key: 'aiServiceUniqueId' } });
    const currentValue = existing?.value?.trim();

    if (currentValue) {
      return currentValue;
    }

    const serviceUniqueId = `smartstock-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await this.upsertSetting('aiServiceUniqueId', serviceUniqueId);
    return serviceUniqueId;
  }

  async ensureAiInstanceToken() {
    const existing = await this.systemSettingRepository.findOne({ where: { key: 'aiInstanceToken' } });
    const currentValue = existing?.value?.trim();

    if (currentValue) {
      return currentValue;
    }

    const instanceToken = `inst-${randomUUID().replace(/-/g, '')}`;
    await this.upsertSetting('aiInstanceToken', instanceToken);
    return instanceToken;
  }

  private buildSpeechProviderConfig(settings: Record<string, string>): SpeechProviderConfig {
    const aiModelApiKey = settings.aiModelApiKey?.trim();
    const aiModelBaseUrl = settings.aiModelBaseUrl?.trim();
    const isDashScope = aiModelBaseUrl.includes('dashscope.aliyuncs.com');

    if (!aiModelApiKey) {
      return {
        enabled: false,
        provider: '',
        model: '',
        apiKey: '',
        reason: '未配置语音服务密钥',
      };
    }

    if (!aiModelBaseUrl) {
      return {
        enabled: false,
        provider: '',
        model: '',
        apiKey: '',
        reason: '未配置语音服务地址',
      };
    }

    if (!isDashScope) {
      return {
        enabled: false,
        provider: '',
        model: '',
        apiKey: '',
        reason: '当前模型服务未启用阿里云实时语音识别',
      };
    }

    return {
      enabled: true,
      provider: 'aliyun-dashscope',
      model: 'paraformer-realtime-v2',
      apiKey: aiModelApiKey,
      reason: '',
    };
  }

  async getSpeechProviderConfig(user?: AuthUser) {
    const settingMap = await this.getAllSettings();
    return this.buildSpeechProviderConfig(settingMap);
  }

  async getSpeechCapabilities(user?: AuthUser): Promise<SpeechCapabilities> {
    const speechConfig = await this.getSpeechProviderConfig(user);
    return {
      enabled: speechConfig.enabled,
      provider: speechConfig.provider,
      model: speechConfig.model,
      realtimeSupported: speechConfig.enabled,
      reason: speechConfig.reason,
    };
  }

  async getSettings(user?: AuthUser) {
    const settingMap = await this.getAllSettings();
    const sanitized = this.buildAiSettingsResponse(settingMap);

    if (user?.role === ROLE_ADMIN) {
      return sanitized;
    }

    return {
      shopName: sanitized.shopName,
      aiConfigured: sanitized.aiConfigured,
      aiProvider: user?.role === ROLE_MANAGER ? sanitized.aiProvider : '',
      aiModelName: user?.role === ROLE_MANAGER ? sanitized.aiModelName : '',
      aiIndustry: user?.role === ROLE_MANAGER ? settingMap.aiIndustry : '',
    };
  }

  async updateSettings(dto: UpdateSystemSettingsDto, user: AuthUser) {
    if (isDemoDeployment()) {
      throw new BadRequestException(DEMO_UNSUPPORTED_MESSAGE);
    }

    const entries = Object.entries(dto).filter(([, value]) => value !== undefined);
    const touchedAiSettings = entries.some(([key]) => key.startsWith('ai'));

    if (touchedAiSettings) {
      await this.ensureAiServiceUniqueId();
      await this.ensureAiInstanceToken();
    }

    for (const [key, value] of entries) {
      await this.upsertSetting(key, value ?? null);
    }

    await this.operationLogService.createLog({
      module: 'system',
      action: 'update_settings',
      operatorId: user.sub,
      detail: JSON.stringify(entries.map(([key]) => key)),
    });

    return this.getSettings(user);
  }

  async getOperationLogs(query: OperationLogQueryDto) {
    return this.operationLogService.getLogs(query);
  }

  async getUsers(query: UserQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.userRepository.createQueryBuilder('user');

    if (query.keyword) {
      qb.andWhere('(user.username LIKE :keyword OR user.real_name LIKE :keyword OR user.phone LIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (typeof query.status === 'number') {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    qb.orderBy('user.id', 'ASC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return {
      list: list.map((user) => this.toUserProfile(user)),
      total,
      page,
      pageSize,
      roleOptions: [ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF].map((role) => getRoleProfile(role)),
    };
  }

  async createUser(dto: CreateUserDto, currentUser: AuthUser) {
    if (!isAppRole(dto.role)) {
      throw new BadRequestException('角色不合法');
    }

    const existingUser = await this.userRepository.findOne({ where: { username: dto.username } });
    if (existingUser) {
      throw new BadRequestException('账号已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      username: dto.username,
      passwordHash,
      realName: dto.realName,
      phone: dto.phone ?? null,
      role: dto.role,
      status: dto.status ?? 1,
    });

    const createdUser = await this.userRepository.save(user);
    await this.operationLogService.createLog({
      module: 'user',
      action: 'create_user',
      operatorId: currentUser.sub,
      detail: `${createdUser.username}:${createdUser.role}`,
    });

    return this.toUserProfile(createdUser);
  }

  async updateUser(id: number, dto: UpdateUserDto, currentUser: AuthUser) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (dto.role !== undefined) {
      if (!isAppRole(dto.role)) {
        throw new BadRequestException('角色不合法');
      }
      user.role = dto.role;
    }

    if (dto.username !== undefined && dto.username !== user.username) {
      const existingUser = await this.userRepository.findOne({ where: { username: dto.username } });
      if (existingUser && existingUser.id !== user.id) {
        throw new BadRequestException('账号已存在');
      }
      user.username = dto.username;
    }

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.realName !== undefined) user.realName = dto.realName;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.status !== undefined) user.status = dto.status;

    const updatedUser = await this.userRepository.save(user);
    await this.operationLogService.createLog({
      module: 'user',
      action: 'update_user',
      operatorId: currentUser.sub,
      detail: `${updatedUser.username}:${updatedUser.role}`,
    });

    return this.toUserProfile(updatedUser);
  }

  async updateUserStatus(id: number, dto: UpdateUserStatusDto, currentUser: AuthUser) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    user.status = dto.status;
    const updatedUser = await this.userRepository.save(user);
    await this.operationLogService.createLog({
      module: 'user',
      action: dto.status === 1 ? 'enable_user' : 'disable_user',
      operatorId: currentUser.sub,
      detail: updatedUser.username,
    });

    return this.toUserProfile(updatedUser);
  }

  private toUserProfile(user: SysUserEntity) {
    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      phone: user.phone,
      role: user.role,
      roleProfile: getRoleProfile(user.role),
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
