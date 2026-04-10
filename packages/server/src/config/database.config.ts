/**
 * 数据库配置文件
 * 负责获取并确保数据库文件目录存在，默认使用 SQLite 存储于 ./data/app.db
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** 获取数据库文件的绝对路径，并确保所在目录已创建 */
export const getDatabasePath = () => {
  const configuredPath = process.env.DB_PATH ?? './data/app.db';
  const resolvedPath = resolve(process.cwd(), configuredPath);
  const directory = dirname(resolvedPath);

  // 如果目录不存在则递归创建
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  return resolvedPath;
};

export const databaseConfig = () => ({
  database: {
    path: getDatabasePath(),
  },
});
