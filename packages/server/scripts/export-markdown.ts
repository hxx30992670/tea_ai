import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

type OpenApiSchema = {
  type?: string;
  format?: string;
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  description?: string;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  $ref?: string;
};

type OpenApiParameter = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
  example?: unknown;
};

type OpenApiRequestBody = {
  required?: boolean;
  content?: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiResponse = {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
};

type OpenApiDocument = {
  openapi: string;
  info: { title: string; description?: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
};

async function exportMarkdown() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('茶掌柜 API 文档')
    .setDescription('茶叶批发零售 AI 智能管理系统服务端接口文档')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig) as OpenApiDocument;
  const markdown = renderMarkdown(document);
  const outputDir = resolve(process.cwd(), 'docs', 'openapi');
  const outputFile = resolve(outputDir, 'openapi.md');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputFile, markdown, 'utf-8');

  await app.close();
  process.stdout.write(`${outputFile}\n`);
}

function renderMarkdown(document: OpenApiDocument) {
  const lines: string[] = [];

  lines.push(`# ${document.info.title}`);
  lines.push('');
  lines.push(`- 版本: ${document.info.version}`);
  lines.push(`- OpenAPI: ${document.openapi}`);
  if (document.info.description) {
    lines.push(`- 说明: ${document.info.description}`);
  }
  lines.push('');
  lines.push('## 鉴权说明');
  lines.push('');
  lines.push('- 除健康检查、登录、刷新 token 外，其余接口默认使用 `Bearer Token`');
  lines.push('- 请求头示例: `Authorization: Bearer <access_token>`');
  lines.push('');

  for (const [tag, operations] of groupByTag(document)) {
    lines.push(`## ${tag}`);
    lines.push('');

    for (const operation of operations) {
      lines.push(`### ${operation.summary}`);
      lines.push('');
      lines.push(`- 方法: ${operation.method}`);
      lines[lines.length - 1] = `- 路径: \`${operation.path}\``;
      lines.push(`- 路径: \`${operation.path}\``);
      lines.push(`- 鉴权: ${operation.security ? '是' : '否'}`);
      if (operation.description) {
        lines.push(`- 说明: ${operation.description}`);
      }
      lines.push('');

      if (operation.parameters.length > 0) {
        lines.push('#### 参数');
        lines.push('');
        lines.push('| 名称 | 位置 | 必填 | 类型 | 说明 | 示例 |');
        lines.push('| --- | --- | --- | --- | --- | --- |');
        for (const parameter of operation.parameters) {
          lines.push(
            `| ${parameter.name} | ${parameter.in} | ${parameter.required ? '是' : '否'} | ${schemaType(parameter.schema)} | ${escapeCell(parameter.description ?? '')} | ${escapeCell(stringifyValue(parameter.example ?? parameter.schema?.example ?? parameter.schema?.default))} |`,
          );
        }
        lines.push('');
      }

      if (operation.requestBody) {
        lines.push('#### 请求体示例');
        lines.push('');
        const requestSchema = firstSchema(operation.requestBody.content ?? {});
        const requestExample = resolveSchemaExample(requestSchema, document);
        lines.push('```json');
        lines.push(JSON.stringify(requestExample, null, 2));
        lines.push('```');
        lines.push('');
      }

      if (operation.responses.length > 0) {
        lines.push('#### 响应');
        lines.push('');
        for (const response of operation.responses) {
          lines.push(`- 状态码: ${response.status}`);
          lines.push(`- 说明: ${response.description || '无'}`);
          if (response.example !== undefined) {
            lines.push('- 返回示例:');
            lines.push('```json');
            lines.push(JSON.stringify(response.example, null, 2));
            lines.push('```');
          }
          lines.push('');
        }
      }
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

function groupByTag(document: OpenApiDocument) {
  const grouped = new Map<
    string,
    Array<{
      method: string;
      path: string;
      summary: string;
      description?: string;
      security: boolean;
      parameters: OpenApiParameter[];
      requestBody?: OpenApiRequestBody;
      responses: Array<{ status: string; description?: string; example?: unknown }>;
    }>
  >();

  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const tag = operation.tags?.[0] ?? '未分组';
      const item = {
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? `${method.toUpperCase()} ${path}`,
        description: operation.description,
        security: Boolean(operation.security?.length),
        parameters: operation.parameters ?? [],
        requestBody: operation.requestBody,
        responses: Object.entries(operation.responses ?? {}).map(([status, response]) => ({
          status,
          description: response.description,
          example: response.content
            ? resolveSchemaExample(firstSchema(response.content), document)
            : undefined,
        })),
      };

      if (!grouped.has(tag)) {
        grouped.set(tag, []);
      }

      grouped.get(tag)?.push(item);
    }
  }

  return grouped;
}

function firstSchema(content: Record<string, { schema?: OpenApiSchema }>) {
  return Object.values(content)[0]?.schema;
}

function resolveSchemaExample(schema: OpenApiSchema | undefined, document: OpenApiDocument): unknown {
  if (!schema) {
    return {};
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop() ?? '';
    return resolveSchemaExample(document.components?.schemas?.[refName], document);
  }

  if (schema.type === 'array') {
    return [resolveSchemaExample(schema.items, document)];
  }

  if (schema.type === 'object' || schema.properties) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      result[key] = resolveSchemaExample(value, document);
    }
    return result;
  }

  if (schema.enum?.length) {
    return schema.enum[0];
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return 0;
  }

  if (schema.type === 'boolean') {
    return false;
  }

  if (schema.type === 'string') {
    return schema.format === 'date-time' ? '2026-01-01T00:00:00.000Z' : '';
  }

  return null;
}

function schemaType(schema?: OpenApiSchema): string {
  if (!schema) {
    return 'unknown';
  }

  if (schema.$ref) {
    return schema.$ref.split('/').pop() ?? 'ref';
  }

  if (schema.type === 'array') {
    return `array<${schemaType(schema.items)}>`;
  }

  return schema.type ?? 'object';
}

function stringifyValue(value: unknown) {
  if (value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

void exportMarkdown();
