/**
 * 茶掌柜 Web 端 - 根组件
 * 配置 Ant Design 主题（茶色系）及全局国际化为中文
 */
import React from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppRouter from '@/router'

/** 茶掌柜自定义主题配置 */
const TEA_THEME = {
  token: {
    colorPrimary: '#2D6A4F',     // 主色：深茶绿
    colorSuccess: '#52b788',     // 成功色：清新绿
    borderRadius: 8,             // 全局圆角
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  components: {
    Menu: {
      itemBg: 'transparent',             // 菜单项背景透明
      itemColor: 'rgba(255,255,255,0.75)',  // 默认文字颜色
      itemHoverColor: '#fff',            // 悬停文字颜色
      itemSelectedColor: '#fff',         // 选中文字颜色
      itemSelectedBg: 'rgba(255,255,255,0.15)',  // 选中背景
      itemHoverBg: 'rgba(255,255,255,0.1)',      // 悬停背景
      subMenuItemBg: 'transparent',      // 子菜单背景
    },
  },
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={TEA_THEME}>
      <AppRouter />
    </ConfigProvider>
  )
}
