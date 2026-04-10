/**
 * 茶掌柜 Web 端 - 应用入口文件
 * 负责挂载根组件、配置国际化及全局样式
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App'
import 'antd/dist/reset.css'
import './index.css'

// 设置 dayjs 默认语言为中文
dayjs.locale('zh-cn')

// 将 React 应用挂载到 index.html 中的 #root 节点
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
