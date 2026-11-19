# Ks Finance

个人与家庭财务管理系统，采用本地优先的 PWA 架构。

## 本地开发

使用 Node.js 22.12+（22.x）或 Node.js 24+，以及 `package.json` 指定的 pnpm 版本。使用 Corepack 时，先运行 `corepack enable pnpm`。从仓库根目录执行以下命令。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm typecheck` 检查 TypeScript，`pnpm test` 运行 Vitest。首次运行浏览器测试前执行 `pnpm exec playwright install chromium`，随后执行 `pnpm test:e2e`。浏览器测试会构建并启动生产预览，验证 IndexedDB 初始化及离线重载。

`pnpm build` 将站点输出到 `apps/web/dist`，`pnpm preview` 预览构建结果。Service Worker 在生产构建中启用，浏览器需要通过 HTTPS 或本地回环地址访问。

`pnpm lint` 运行 Oxlint，`pnpm format` 用 Prettier 写入格式，`pnpm format:check` 检查格式。

## 工程结构

- `apps/web` 提供 React、React Router 和 Vite 入口，以及由 vite-plugin-pwa 和 Workbox 生成的离线缓存。
- `packages/domain` 和 `packages/application` 对应领域规则与应用服务。Decimal.js 用于后续汇率计算，金额按 Wiki 约定使用 BigInt 运算、十进制字符串持久化。
- `packages/infrastructure` 提供 Dexie 数据库的首个版本，Repository 随账务功能接入。
- `packages/ui` 配置 Zustand 和 React Hook Form，`packages/analytics` 配置 ECharts，`packages/shared` 配置 Zod 和 Day.js。日期库暂用 Day.js。
- `packages/sync`、`packages/security` 和 `packages/ai` 预留模块目录。WebDAV、加密库、后台任务及自托管同步服务随对应阶段接入。

架构与数据模型见 [项目 Wiki](https://github.com/korvosuno/ks-finance/wiki/Index)。
