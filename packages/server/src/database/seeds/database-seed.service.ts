import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../../entities/category.entity';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { SystemSettingEntity } from '../../entities/system-setting.entity';

const DEFAULT_CATEGORIES = [
  '绿茶',
  '红茶',
  '乌龙茶',
  '普洱',
  '白茶',
  '黄茶',
  '黑茶',
  '花茶',
];

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  constructor(
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(SystemSettingEntity)
    private readonly systemSettingRepository: Repository<SystemSettingEntity>,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.seedCategories();
    await this.seedAiConfig();
  }

  private async seedAdmin() {
    const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
    const existingUser = await this.userRepository.findOne({ where: { username } });

    if (existingUser) {
      return;
    }

    const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'Admin@123456';
    const passwordHash = await bcrypt.hash(password, 10);

    await this.userRepository.save(
      this.userRepository.create({
        username,
        passwordHash,
        realName: process.env.DEFAULT_ADMIN_REAL_NAME ?? '系统管理员',
        role: 'admin',
        status: 1,
      }),
    );
  }

  /**
   * 从环境变量预置 AI 配置（仅在数据库中尚未配置时生效）
   * 生产部署时可通过系统设置页面覆盖这些值
   */
  private async seedAiConfig() {
    const provider = process.env.AI_PROVIDER;
    const modelApiKey = process.env.AI_MODEL_API_KEY;
    if (!provider || !modelApiKey) return;

    const existing = await this.systemSettingRepository.findOne({
      where: { key: 'aiProvider' },
    });
    if (existing?.value) return; // 已有配置，不覆盖

    const defaultBaseUrl =
      provider === 'deepseek'
        ? 'https://api.deepseek.com'
        : 'https://dashscope.aliyuncs.com/compatible-mode/v1';

    const initialSettings: Array<{ key: string; value: string }> = [
      { key: 'aiApiKey', value: process.env.AI_API_KEY ?? 'sk-tea-demo-local' },
      { key: 'aiProvider', value: provider },
      { key: 'aiModelApiKey', value: modelApiKey },
      { key: 'aiModelName', value: process.env.AI_MODEL_NAME ?? 'qwen-plus' },
      { key: 'aiModelBaseUrl', value: process.env.AI_MODEL_BASE_URL ?? defaultBaseUrl },
      { key: 'aiPromptServiceUrl', value: process.env.AI_PROMPT_SERVICE_URL ?? 'http://127.0.0.1:3010' },
      { key: 'aiIndustry', value: process.env.AI_INDUSTRY ?? 'tea' },
    ];

    for (const { key, value } of initialSettings) {
      await this.systemSettingRepository.save(
        this.systemSettingRepository.create({ key, value }),
      );
    }
  }

  private async seedCategories() {
    const categoryCount = await this.categoryRepository.count();

    if (categoryCount > 0) {
      return;
    }

    await this.categoryRepository.save(
      DEFAULT_CATEGORIES.map((name, index) =>
        this.categoryRepository.create({
          name,
          sortOrder: index + 1,
        }),
      ),
    );
  }
}
