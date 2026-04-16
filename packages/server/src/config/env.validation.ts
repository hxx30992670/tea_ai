type EnvConfig = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_ACCESS_EXPIRES_IN",
  "JWT_REFRESH_EXPIRES_IN",
] as const;

export function validateEnv(config: EnvConfig) {
  const missingKeys = REQUIRED_KEYS.filter((key) => !config[key]);

  if (missingKeys.length > 0) {
    throw new Error(`缺少必要环境变量: ${missingKeys.join(", ")}`);
  }

  return config;
}
