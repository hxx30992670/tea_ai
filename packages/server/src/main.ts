/**
 * 茶掌柜 - 应用入口文件
 * 负责初始化 NestJS 应用、配置全局中间件、拦截器及 Swagger 文档
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/** 应用启动引导函数 */
async function bootstrap() {
  // 创建 NestJS 应用实例（关闭内置 bodyParser，手动设 10MB 上限支持图片 base64）
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 设置全局 API 前缀为 /api
  app.setGlobalPrefix('api');
  // 启用跨域资源共享（CORS）
  app.enableCors();
  // 注册全局验证管道：自动过滤白名单外字段、自动类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // 剔除 DTO 中未定义的字段
      transform: true,        // 自动将请求数据转换为 DTO 类型
      forbidNonWhitelisted: true,  // 遇到未定义字段时报错
    }),
  );
  // 注册全局响应拦截器：统一包装响应格式为 { code, message, data }
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 配置 Swagger API 文档
  const swaggerConfig = new DocumentBuilder()
    .setTitle('茶掌柜 API 文档')
    .setDescription('茶叶批发零售 AI 智能管理系统服务端接口文档')
    .setVersion('0.1.0')
    .addBearerAuth()  // 支持 Bearer Token 鉴权
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  // 挂载 Swagger UI 到 /api/docs 路径
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api/docs-json',  // 开放 JSON 格式文档供工具调用
    swaggerOptions: {
      persistAuthorization: true,  // 刷新页面后保持鉴权状态
    },
  });

  // 从环境变量读取端口，默认 3000
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

// 启动应用
void bootstrap();
