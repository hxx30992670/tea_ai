/**
 * AI 智能问答控制器
 * 处理用户 AI 对话、会话管理、连接测试等请求
 * 支持 SSE 流式响应，实现逐字输出效果
 */
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ROLE_ADMIN, ROLE_MANAGER } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiHistoryQueryDto } from './dto/ai-history-query.dto';
import { AiRecognizeDto } from './dto/ai-recognize.dto';
import { AiTestDto } from './dto/ai-test.dto';
import { AiService } from './ai.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * AI 对话 —— SSE 流式响应
   *
   * 事件格式（text/event-stream）：
   *   event: status  data: { phase: "sql"|"execute"|"summary", message: string }
   *   event: token   data: { content: string }   ← 总结阶段逐 token 推送
   *   event: error   data: { message: string }
   *   event: done    data: { success: true }
   */
  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: 'AI 自然语言查询（SSE 流式响应）' })
  @ApiProduces('text/event-stream')
  @ApiBody({ type: AiChatDto })
  @Post('chat')
  async chat(
    @Body() dto: AiChatDto,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // 关闭 Nginx 缓冲，确保 SSE 实时到达
    response.flushHeaders();

    const write = (event: string, data: unknown) => {
      if (!response.writableEnded) {
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      if (dto.attachment) {
        await this.aiService.buildVisionChatResponse(
          dto.question,
          dto.attachment,
          user,
          dto.history ?? [],
          write,
          dto.sessionId,
        );
      } else {
        await this.aiService.buildChatResponse(dto.question, user, dto.history ?? [], write, dto.sessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '服务内部错误';
      write('error', { code: 'AI_INTERNAL_ERROR', message });
    } finally {
      write('done', { success: true });
      response.end();
    }
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: 'AI 结构化识别（用于自动填表）' })
  @ApiBody({ type: AiRecognizeDto })
  @Post('recognize')
  recognize(@Body() dto: AiRecognizeDto) {
    return this.aiService.buildRecognizeResponse(dto.module, dto.attachment, dto.products);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '测试大模型连接（不依赖已保存配置）' })
  @ApiBody({ type: AiTestDto })
  @Post('test')
  testConnection(@Body() dto: AiTestDto, @CurrentUser() user: AuthUser) {
    return this.aiService.testConnection(dto, user);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: 'AI 智能建议（补货预警等）' })
  @ApiOkResponse({ description: '返回 AI 建议列表或禁用原因' })
  @Get('suggestions')
  getSuggestions() {
    return this.aiService.getSuggestions();
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: 'AI 对话历史' })
  @ApiOkResponse({ description: '分页 AI 对话历史' })
  @Get('history')
  getHistory(@CurrentUser() user: AuthUser, @Query() query: AiHistoryQueryDto) {
    return this.aiService.getHistory(user, query);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: 'AI 会话列表（最多10条，最新在前）' })
  @ApiOkResponse({ description: '会话列表' })
  @Get('sessions')
  getSessions(@CurrentUser() user: AuthUser) {
    return this.aiService.getSessions(user);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '获取某个会话的消息记录' })
  @ApiOkResponse({ description: '会话消息列表' })
  @Get('sessions/:sessionId')
  getSessionMessages(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthUser) {
    return this.aiService.getSessionMessages(user, sessionId);
  }
}
