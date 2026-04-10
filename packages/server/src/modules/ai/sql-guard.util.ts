/**
 * SQL 安全守卫工具
 * 用于 AI 生成的 SQL 语句安全检查，仅允许 SELECT 查询，禁止任何写操作
 * 防止 AI 生成危险的 SQL 语句破坏数据库
 */

/** 匹配 SELECT 语句的正则 */
const SELECT_SQL_PATTERN = /^\s*select\b/i;
/** 禁止出现的危险关键字：包含所有写操作及敏感命令 */
const FORBIDDEN_SQL_PATTERN = /\b(insert|update|delete|drop|alter|truncate|create|replace|attach|detach|pragma)\b/i;

/** 检查 SQL 是否为安全的 SELECT 语句 */
export function isSafeSelectSql(sql: string) {
  const normalizedSql = sql.trim();

  // 必须为 SELECT 开头
  if (!SELECT_SQL_PATTERN.test(normalizedSql)) {
    return false;
  }

  // 不能包含任何危险关键字
  return !FORBIDDEN_SQL_PATTERN.test(normalizedSql);
}

/** 构建不安全 SQL 的错误提示原因 */
export function buildSqlGuardReason(sql: string) {
  if (!SELECT_SQL_PATTERN.test(sql.trim())) {
    return 'AI 生成的 SQL 不是 SELECT 语句';
  }

  if (FORBIDDEN_SQL_PATTERN.test(sql)) {
    return 'AI 生成的 SQL 包含危险关键字';
  }

  return '';
}
