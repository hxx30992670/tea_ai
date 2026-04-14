import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'
  const enableHttps = env.VITE_MOBILE_HTTPS !== 'false'
  const enablePwaInDev = env.VITE_ENABLE_PWA_DEV === 'true'

  const certPath = path.resolve(__dirname, 'cert.pem')
  const keyPath = path.resolve(__dirname, 'key.pem')
  const hasCustomCert = enableHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)

  return {
    base,
    plugins: [
      react(),
      hasCustomCert ? null : (enableHttps ? basicSsl() : null),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icons/**', 'favicon.ico'],
        manifest: {
          name: '茶掌柜',
          short_name: '茶掌柜',
          description: '茶叶批发零售管理助手',
          theme_color: '#0A0E1A',
          background_color: '#0A0E1A',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'icons/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: `${base}index.html`,
          runtimeCaching: [
            {
              // AI 请求：纯网络，不走 10 秒超时兜底，否则识别大图容易误报超时
              urlPattern: /^\/api\/ai\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              // API 请求：网络优先，断网时返回缓存
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 5 * 60,
                },
                networkTimeoutSeconds: 10,
              },
            },
          ],
        },
        devOptions: {
          enabled: enablePwaInDev,
          type: 'module',
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    server: {
      port: 8081,
      host: '0.0.0.0',
      https: hasCustomCert
        ? { cert: certPath, key: keyPath }
        : enableHttps,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
