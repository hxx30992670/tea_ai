export function isDemoDeployment() {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.APP_DEMO_ENABLED ?? '').trim().toLowerCase(),
  );
}

export const DEMO_UNSUPPORTED_MESSAGE = '当前为演示环境，系统设置功能暂不支持修改';
