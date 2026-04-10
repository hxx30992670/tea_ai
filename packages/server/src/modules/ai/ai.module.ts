/**
 * AI 模块
 * 组装 AI 相关的所有服务、控制器及模型提供商
 * 提供 AI 自然语言查询、智能建议、会话管理等功能
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConversationEntity } from '../../entities/ai-conversation.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SystemModule } from '../system/system.module';
import { AiConfigService } from './ai-config.service';
import { AiController } from './ai.controller';
import { AiPromptClientService } from './ai-prompt-client.service';
import { AiSqlService } from './ai-sql.service';
import { AiService } from './ai.service';
import { ModelProviderRegistry } from './model-provider.registry';
import { DeepSeekProviderClient } from './providers/deepseek.provider';
import { QwenProviderClient } from './providers/qwen.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiConversationEntity, ProductEntity]),  // 注册 AI 对话及产品实体
    SystemModule,  // 用于读取 AI 配置
  ],
  controllers: [AiController],
  providers: [
    AiService,                  // AI 核心业务逻辑
    AiConfigService,            // AI 配置管理
    AiPromptClientService,      // Prompt 服务通信
    AiSqlService,               // SQL 执行与安全守卫
    ModelProviderRegistry,      // 模型提供商注册表
    QwenProviderClient,         // 通义千问客户端
    DeepSeekProviderClient,     // DeepSeek 客户端
  ],
  exports: [AiService],  // 导出 AiService 供其他模块使用
})
export class AiModule {}
