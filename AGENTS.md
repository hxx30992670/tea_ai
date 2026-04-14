# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**茶掌柜 (Tea Manager)** — A tea wholesale/retail AI-powered management system. The app name in code is `smartstock`. It's a pnpm monorepo with two packages: `packages/server` (NestJS backend) and `packages/web` (React frontend).

## Commands

All commands are run from the repo root unless noted.

```bash
# Install dependencies
pnpm install

# Development (run both concurrently)
pnpm dev

# Run server only (hot-reload via nest --watch)
pnpm dev:server

# Run frontend only (Vite on port 8080)
pnpm dev:web

# Build
pnpm build:server
pnpm build:web

# Start production server (after build)
pnpm start:server

# Export OpenAPI docs
pnpm export:openapi   # → packages/server/docs/openapi/openapi.json
pnpm export:markdown  # → packages/server/docs/openapi/openapi.md
```

There are no test scripts configured in this project.

## Git Commit Rules

All git commits in this repository must use a Chinese commit message and match the following regex format:

```regex
^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?:\s[\u4e00-\u9fa5].*$
```

Commit message requirements:
- Format must be `type(scope): 中文描述` or `type: 中文描述`
- `type` must be one of `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`
- `scope` is optional and should use lowercase English or kebab-case
- The description after `:` must start with Chinese and remain Chinese-oriented; do not use English-only commit messages

Examples:
- `feat(web): 新增商品批量导入功能`
- `fix(server): 修复销售单库存扣减异常`
- `docs: 补充 AI 模块配置说明`

## Architecture

### Monorepo structure
- `packages/server/` — NestJS 10 REST API
- `packages/web/` — React 18 + Vite SPA

### Backend (`packages/server`)

**Framework**: NestJS with TypeORM. Database is **SQLite via sql.js** (in-process, no native binary required), stored at `packages/server/data/app.db`. Schema syncs automatically on startup (`synchronize: true`).

**Module layout** — each domain follows the NestJS convention of `module / controller / service / dto/`:
- `auth` — JWT login, refresh tokens, password change; uses `passport-jwt`
- `product` — products and categories
- `stock` — manual stock-in/out, stock records
- `purchase-order` — purchase orders with line items; stock-in on confirmation
- `sale-order` — sale orders with line items; stock-out on confirmation
- `payment` — payment records linked to sale orders
- `customer` — customers + follow-up records
- `supplier` — suppliers
- `dashboard` — aggregated stats and sales trends
- `system` — user management, system settings, operation logs
- `ai` — AI chat feature (described below)

**Common layer** (`src/common/`):
- `ResponseInterceptor` — wraps all responses as `{ code: 200, message: "success", data: ... }`
- `JwtAuthGuard` — global JWT guard; routes opt out with `@Public()`
- `RolesGuard` + `@Roles()` decorator — role-based access using the `roles` constants
- `@CurrentUser()` decorator — extracts the JWT payload as `AuthUser`

**Config**: `@nestjs/config` with env validation via class-validator in `src/config/env.validation.ts`. Copy `.env.example` to `.env` to get started.

**API docs**: Swagger UI available at `http://localhost:3000/api/docs` when the server is running.

**Database seed**: `DatabaseSeedService` runs on startup to create the default admin user if none exists (credentials from env vars `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`).

### AI Module

The AI feature (`src/modules/ai/`) lets users ask natural-language questions that are answered by querying the SQLite database:

1. **AiConfigService** — reads AI config from `SystemSettingEntity`; checks if enabled and which provider/model/key to use
2. **AiPromptClientService** — builds the two-phase prompt: SQL generation prompt and summary prompt
3. **ModelProviderRegistry** — holds registered `ModelProviderClient` implementations (currently `DeepSeekProviderClient` and `QwenProviderClient`)
4. **AiSqlService** — executes the AI-generated SQL against the live database
5. **sql-guard.util.ts** — safety guard: only `SELECT` statements are allowed; any write keyword causes rejection

The AI chat flow: user question → generate SQL via LLM → execute SQL → summarize results via LLM → return answer.

AI providers and API keys are configured through the system settings UI (not env vars).

### Frontend (`packages/web`)

**Stack**: React 18, React Router 6, Ant Design 5 + ProComponents, Zustand (state), Axios, Recharts.

**`@` alias** resolves to `packages/web/src/`.

**Auth state**: Zustand store with `persist` middleware (localStorage key `tea-auth`). Stores `accessToken`, `refreshToken`, and `user`. The Axios instance in `src/api/index.ts` auto-attaches the Bearer token and redirects to `/login` on 401.

**Dev proxy**: Vite proxies `/api/*` → `http://localhost:3000`, so the frontend on port 8080 talks to the NestJS server on port 3000 transparently.

**Page → route mapping**: All authenticated pages live under `src/pages/` and are wrapped by `BasicLayout`. Route guard (`RequireAuth`) checks `isLoggedIn` from the auth store.

**API layer**: `src/api/` has one file per domain, each exporting typed functions that call the shared Axios instance. All responses are unwrapped from the `{ code, message, data }` envelope by the response interceptor.
