# 茶掌柜 SmartStock

面向茶行业的 **进销存 + 客户管理 + 移动开单 + AI 助手** 一体化系统。

> 主程序免费开源，AI Agent 服务由作者托管并单独提供，不包含在当前仓库内。

## 项目定位

茶掌柜不是通用 ERP 的简单改皮，而是围绕茶叶批发零售场景设计的业务系统，重点解决：

- 商品规格复杂：茶类、年份、规格、包装单位、基础单位换算
- 销售流程碎片化：门店、微信、熟客赊账、移动场景临时开单
- 售后链路不完整：退货、退款、换货、补差价
- 经营数据分散：库存、销售、收款、客户跟进难以统一查看

适合：茶店、茶仓、批发档口、区域代理、零售兼批发门店。

## 开源边界

本仓库开源的是主程序本体，包含：

- `packages/server`：NestJS 后端 API
- `packages/web`：Web 管理端
- `packages/mobile`：移动端 PWA
- `packages/shared`：前端共享代码

不在开源范围内的部分：

- `prompt-center`
- 作者托管的 AI Agent 服务
- 相关 Prompt 编排、服务端策略与私有数据

也就是说：

- 不接 AI 服务，主程序依然可以正常作为进销存系统使用
- 需要 AI 功能时，再接入作者提供的 Agent 服务

## 核心功能

- **数据看板**：今日营收、本月销售、库存价值、应收总额、销售趋势、库存预警
- **商品管理**：茶类、年份、规格、包装单位、基础单位、SKU 管理
- **库存管理**：入库、出库、盘盈、盘亏、报损、库存流水追踪
- **销售订单**：销售、出库、收款、退货、退款、换货、快速完成开单
- **采购订单**：采购下单、入库确认、采购退货
- **客户管理**：客户档案、跟进记录、应收追踪
- **供应商管理**：供应商档案、采购历史
- **收付款管理**：销售收款、采购付款、应收应付查询
- **移动端 PWA**：手机开单、查看看板、移动 AI 对话，支持安装到桌面
- **AI 助手**：自然语言查经营数据、图表可视化、图片识别录单

## 截图预览

### Web 端

| 数据看板 | 销售订单 |
| :---: | :---: |
| ![数据看板](docs/screenshots/web-dashboard.png) | ![销售订单](docs/screenshots/web-sale-orders.png) |

| AI 助手 | 商品管理 |
| :---: | :---: |
| ![AI助手](docs/screenshots/web-ai-assistant.png) | ![商品管理](docs/screenshots/web-products.png) |

### 移动端

| 首页看板 | 开单列表 | AI 助手 |
| :---: | :---: | :---: |
| ![移动看板](docs/screenshots/mobile-dashboard.png) | ![移动开单](docs/screenshots/mobile-orders.png) | ![移动AI](docs/screenshots/mobile-ai.png) |

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 后端 | NestJS 10、TypeORM、SQLite(sql.js)、JWT、Swagger |
| Web 端 | React 18、Vite、Ant Design 5、ProComponents、Zustand、Recharts |
| 移动端 | React 18、Vite、PWA、Zustand |
| 数据库 | SQLite(sql.js，纯 JS，无需单独安装数据库) |
| AI 接入 | 外部大模型 API + 作者托管 AI Agent 服务 |

## 目录结构

```text
smartstock/
├── packages/
│   ├── server/          # NestJS REST API
│   ├── web/             # Web 管理端
│   ├── mobile/          # 移动端 PWA
│   └── shared/          # 前端共享代码
├── deploy/              # Docker / Nginx 部署配置
├── docker-compose.yml
├── Dockerfile
└── pnpm-workspace.yaml
```

## 本地开发

### 环境要求

- Node.js >= 18
- pnpm >= 10

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
cp packages/server/.env.example packages/server/.env
```

首次启动时会根据 `.env` 自动创建管理员账号。

示例：

```env
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=Admin@123456
```

### 启动开发服务

```bash
# 后端 + Web
pnpm dev

# 后端 + Web + Mobile
pnpm dev:all

# 单独启动 Mobile
pnpm dev:mobile
```

### 本地访问地址

- Web：`http://localhost:8080`
- Mobile：`https://localhost:8081`
- API 文档：`http://localhost:3000/api/docs`

说明：

- `mobile` 默认启用 HTTPS，方便真机调试摄像头等能力
- 如果只想本地简单调试，也可以关闭 HTTPS：

```bash
VITE_MOBILE_HTTPS=false pnpm dev:mobile
```

此时地址为：`http://localhost:8081`

## Docker 一键部署

当前仓库已经支持单容器部署，容器内同时运行：

- `NestJS` 后端
- `Nginx` 静态资源服务
- `Web` 前端静态文件
- `Mobile` 前端静态文件

### 部署门槛

茶掌柜并不要求必须额外购买云服务器。

对于个人店铺、小团队或门店自用场景，一台普通台式电脑或办公主机即可完成部署。使用 Docker 启动后，可以直接在局域网内访问使用。

如果需要让手机、门店分点或外部人员访问，可以再配合 **Intranet Penetration (内网穿透)** 工具把本地服务暴露出去。

你可以按下面两种方式理解：

- **本地 / 局域网使用**：一台电脑部署即可
- **远程访问使用**：一台电脑部署 + 内网穿透

> 说明：如果是多人长期在线、跨地区协作、对稳定性要求较高，仍然建议使用独立服务器或云主机部署。

### 1. 准备环境变量

```bash
cp packages/server/.env.example packages/server/.env
```

### 2. 启动

```bash
docker compose up -d --build
```

### 3. 访问地址

- Web：`http://localhost/`
- Mobile：`http://localhost/m/`
- API 文档：`http://localhost/api/docs`

### 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

### 数据持久化

SQLite 数据目录会挂载到宿主机：

```text
./data -> /app/packages/server/data
```

默认数据库文件：

```text
packages/server/data/app.db
```

## AI 功能说明

AI 功能依赖作者托管的 **AI Agent 服务**，不随本仓库开源。

当前支持的 AI 场景：

- 自然语言查询经营数据
- 自动生成图表可视化
- 图片识别订单内容
- 批量识别并拆分订单

### AI 接入方式

服务端通过以下配置连接作者提供的 Agent 服务：

- `AI_API_KEY`
- `AI_PROMPT_SERVICE_URL`

这些配置项已经在 `packages/server/.env.example` 中预留。

### 如何获取 AI 服务

扫码添加微信，了解 AI Agent 服务接入方式与定价。

<p align="center">
  <img src="docs/screenshots/wechat-qrcode.png" alt="微信二维码" width="220" />
  <br />
  <em>扫码咨询 AI 服务</em>
</p>

## 项目特点

- **开箱即用**：默认使用 `SQLite (嵌入式数据库)`，无需单独安装 MySQL/PostgreSQL
- **双端覆盖**：Web 管理 + Mobile 开单，适合门店和外出场景
- **茶行业适配**：围绕茶叶规格、年份、包装和熟客交易习惯设计
- **部署简单**：支持 Docker 一键部署，默认一个容器跑完整套服务
- **AI 可选接入**：主程序可单独用，AI 能力按需接入

## 适合怎么用

1. 先把它当成一套免费的茶行业进销存系统使用
2. 跑通商品、库存、销售、采购、客户流程
3. 后续如需 AI 问答、AI 识别录单，再接入作者托管服务

## License

本仓库中的主程序代码基于 [MIT License](LICENSE) 开源。

说明：

- 开源范围仅限当前仓库中的代码
- 私有 AI 服务及 `prompt-center` 不在开源范围内

---

如果这个项目对你有帮助，欢迎点个 Star。
