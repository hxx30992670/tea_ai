#!/bin/sh
# 启动 Nginx (后台)
nginx

# 启动 NestJS (前台，保持容器存活)
cd /app/packages/server
exec node dist/main.js
