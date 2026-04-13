# ---- 构建阶段 ----
FROM node:18-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

WORKDIR /app

# 先拷贝依赖描述文件，利用 Docker 缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/mobile/package.json packages/mobile/

RUN pnpm install --frozen-lockfile

# 拷贝源码
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/web/ packages/web/
COPY packages/mobile/ packages/mobile/

# 构建
RUN pnpm build:web && VITE_BASE_PATH=/m/ pnpm build:mobile && pnpm build:server

# ---- 运行阶段 ----
FROM node:18-alpine

RUN corepack enable && corepack prepare pnpm@10.26.0 --activate \
    && apk add --no-cache nginx

WORKDIR /app

# 拷贝 server 运行时依赖
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile --prod --filter server

# 拷贝构建产物
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/web/dist /usr/share/nginx/web
COPY --from=builder /app/packages/mobile/dist /usr/share/nginx/mobile

# Nginx 配置
COPY deploy/nginx.conf /etc/nginx/http.d/default.conf

# 数据目录
RUN mkdir -p /app/packages/server/data

# 启动脚本
COPY deploy/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"]
