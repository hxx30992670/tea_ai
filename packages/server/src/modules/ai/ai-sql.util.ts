const SQL_BLOCK_PATTERN = /```sql\s*([\s\S]*?)```/i;

export function extractSqlFromContent(content: string) {
  const matchedBlock = content.match(SQL_BLOCK_PATTERN);
  if (matchedBlock?.[1]) {
    return matchedBlock[1].trim();
  }

  const trimmed = content.trim();
  return trimmed || null;
}

export function ensureSqlLimit(sql: string, limit = 100) {
  if (/\blimit\s+\d+\b/i.test(sql)) {
    return sql.trim();
  }

  return `${sql.trim().replace(/;$/, '')} LIMIT ${limit}`;
}

export function formatRowsForSummary(rows: Record<string, unknown>[], maxRows = 20) {
  return JSON.stringify(rows.slice(0, maxRows), null, 2);
}
