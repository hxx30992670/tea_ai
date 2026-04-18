/**
 * AI SQL 执行服务
 * 负责安全地执行 AI 生成的 SQL 查询：
 * - 通过 SQL 守卫检查（仅允许 SELECT）
 * - 自动修正常见 AI 生成错误（UNION ORDER BY、deleted_at 处理等）
 * - 执行查询并返回结果
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiQueryExecutionResult } from './ai.types';
import { ensureSqlLimit } from './ai-sql.util';
import { buildSqlGuardReason, isSafeSelectSql } from './sql-guard.util';

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class AiSqlService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async executeSelect(sql: string): Promise<AiQueryExecutionResult> {
    const normalizedSql = this.repairCommonMistakes(ensureSqlLimit(sql));

    if (!isSafeSelectSql(normalizedSql)) {
      return {
        ok: false,
        reason: buildSqlGuardReason(normalizedSql),
        sql: normalizedSql,
      };
    }

    try {
      const rows = ((await this.dataSource.query(normalizedSql)) as Record<string, unknown>[])
        .map((row) => this.normalizeRowDateTimes(row));
      return {
        ok: true,
        sql: normalizedSql,
        rows,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return {
        ok: false,
        reason: `SQL 执行失败: ${message}`,
        sql: normalizedSql,
      };
    }
  }

  private repairCommonMistakes(sql: string) {
    let nextSql = sql;

    nextSql = nextSql
      .replace(/direction\s*=\s*'in'/gi, "direction = 'return'")
      .replace(/direction\s*=\s*"in"/gi, 'direction = "return"');

    // SQLite 在 UNION / UNION ALL 场景下，ORDER BY 不能使用表别名列名，只能使用结果列名。
    if (/\bunion(?:\s+all)?\b/i.test(nextSql)) {
      nextSql = nextSql.replace(
        /ORDER\s+BY\s+([a-zA-Z_][\w]*)\.(created_at|order_no|return_no|refund_no|exchange_no|customer_name|supplier_name)\b/gi,
        'ORDER BY $2',
      );
    }

    if (/from\s+customer\b/i.test(nextSql)) {
      nextSql = nextSql
        .replace(/\s+AND\s+deleted_at\s+IS\s+NULL/gi, '')
        .replace(/\s+WHERE\s+deleted_at\s+IS\s+NULL\s+AND/gi, ' WHERE ')
        .replace(/\s+WHERE\s+deleted_at\s+IS\s+NULL/gi, '')
        .replace(/\s+AND\s+status\s*=\s*1/gi, '')
        .replace(/\s+WHERE\s+status\s*=\s*1\s+AND/gi, ' WHERE ')
        .replace(/\s+WHERE\s+status\s*=\s*1/gi, '')
    }

    if (/from\s+supplier\b/i.test(nextSql)) {
      nextSql = nextSql
        .replace(/\s+AND\s+deleted_at\s+IS\s+NULL/gi, '')
        .replace(/\s+WHERE\s+deleted_at\s+IS\s+NULL\s+AND/gi, ' WHERE ')
        .replace(/\s+WHERE\s+deleted_at\s+IS\s+NULL/gi, '')
        .replace(/\s+AND\s+status\s*=\s*1/gi, '')
        .replace(/\s+WHERE\s+status\s*=\s*1\s+AND/gi, ' WHERE ')
        .replace(/\s+WHERE\s+status\s*=\s*1/gi, '')
    }

    if (/from\s+sale_order\b/i.test(nextSql) && !/received_amount\s*-\s*returned_amount/i.test(nextSql)) {
      nextSql = nextSql.replace(
        /(\b\w+\.)?total_amount\s*-\s*(\b\w+\.)?received_amount(?!\s*-\s*(\b\w+\.)?returned_amount)/gi,
        (matched, totalPrefix = '', receivedPrefix = '') => {
          const returnedPrefix = receivedPrefix || totalPrefix || '';
          return `${totalPrefix}total_amount - ${receivedPrefix}received_amount - ${returnedPrefix}returned_amount`;
        },
      );
    }

    if (/from\s+purchase_order\b/i.test(nextSql) && !/paid_amount\s*-\s*returned_amount/i.test(nextSql)) {
      nextSql = nextSql.replace(
        /(\b\w+\.)?total_amount\s*-\s*(\b\w+\.)?paid_amount(?!\s*-\s*(\b\w+\.)?returned_amount)/gi,
        (matched, totalPrefix = '', paidPrefix = '') => {
          const returnedPrefix = paidPrefix || totalPrefix || '';
          return `${totalPrefix}total_amount - ${paidPrefix}paid_amount - ${returnedPrefix}returned_amount`;
        },
      );
    }

    if (/from\s+sale_order\b/i.test(nextSql) && /join\s+customer\b/i.test(nextSql) && !/left\s+join\s+customer\b/i.test(nextSql)) {
      nextSql = nextSql.replace(/join\s+customer\b/gi, 'LEFT JOIN customer');
    }

    nextSql = this.rewriteCreatedAtToChinaTime(nextSql);

    return nextSql
      .replace(/\s+LIMIT\s+100\s+LIMIT\s+100/gi, ' LIMIT 100')
      .replace(/ORDER\s+BY\s+created_at\s+DESC\s+LIMIT\s+(\d+)\s+LIMIT\s+\1/gi, 'ORDER BY created_at DESC LIMIT $1')
  }

  private rewriteCreatedAtToChinaTime(sql: string) {
    let nextSql = sql;

    // 数据库里的 created_at 目前按 UTC 存储，AI 常用 DATE(created_at)=DATE('now','localtime')
    // 会把北京时间凌晨的订单误判成前一天，因此统一把 created_at 比较/展示口径转成北京时间。
    nextSql = nextSql.replace(
      /DATE\(\s*((?!datetime\()[^()]*?\bcreated_at\b[^()]*)\s*\)/gi,
      (_matched, columnExpr: string) => `DATE(datetime(${columnExpr.trim()}, '+8 hours'))`,
    );

    nextSql = nextSql.replace(
      /strftime\(\s*'(%Y-%m(?:-%d)?)'\s*,\s*((?!datetime\()[^()]*?\bcreated_at\b[^()]*)\s*\)/gi,
      (_matched, format: string, columnExpr: string) => `strftime('${format}', datetime(${columnExpr.trim()}, '+8 hours'))`,
    );

    return nextSql;
  }

  private normalizeRowDateTimes(row: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, this.normalizeDateTimeValue(key, value)]),
    );
  }

  private normalizeDateTimeValue(key: string, value: unknown) {
    if (typeof value !== 'string') {
      return value;
    }

    const normalizedKey = key.trim();
    if (!/(?:At|_at)$/.test(normalizedKey)) {
      return value;
    }

    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?$/.test(trimmed)) {
      return value;
    }

    const parsed = new Date(
      trimmed.includes('T') || trimmed.endsWith('Z')
        ? trimmed
        : `${trimmed.replace(' ', 'T')}Z`,
    );

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    const chinaDate = new Date(parsed.getTime() + CHINA_OFFSET_MS);
    const year = chinaDate.getUTCFullYear();
    const month = String(chinaDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(chinaDate.getUTCDate()).padStart(2, '0');
    const hours = String(chinaDate.getUTCHours()).padStart(2, '0');
    const minutes = String(chinaDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(chinaDate.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
