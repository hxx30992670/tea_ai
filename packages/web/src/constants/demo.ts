export const DEMO_UNSUPPORTED_MESSAGE = '当前为演示环境，系统设置功能暂不支持修改'

export const IS_DEMO_DEPLOYMENT = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_APP_DEMO_ENABLED ?? '').trim().toLowerCase(),
)

export const DEMO_SHOP_NAME = '茶掌柜示范门店'
