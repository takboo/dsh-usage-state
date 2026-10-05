# 架构与验证（Architecture）

> 目标读者：接手这个仓库的人（包括几个月后的作者）。本文件回答两件事：**代码放在哪、为什么这样放**（代码地图），以及**每条设计决策落在哪里、测到什么程度**（追溯表与证据）。
> 相关文档：[`design-consensus.md`](design-consensus.md)（当前有效的设计）、[`design-changelog.md`](design-changelog.md)（决策演变史）、[`release.md`](release.md)（发布与验收）、[`backlog.md`](backlog.md)（未验证/未做事项）、[`platform-notes.md`](platform-notes.md)（平台行为事实）。
> 当前状态：实现完成、本机验收通过、已发布 npm 并收录 dsh-market；`npm test` 281 条用例全绿（2026-10-05）。

## 1. 总体形态

```
┌─ DSH 宿主 (Node) ──────────────┐   ┌─ DSH 浏览器半边 ────────────────┐
│ src/index.ts    装配入口        │   │ src/client/index.tsx 客户端入口  │
│ src/host/*      适配器/凭据/    │ Typert │ src/client/*    状态行/    │
│                 调度/RPC/设置   │ ─SVG→  │                 设置页/词典  │
│ lib/index.js    产物            │ RPC    │ lib/client.js   产物(CJS工厂) │
│ lib/typert.js   宿主清单        │   │                                │
└────────────────────────────────┘   └────────────────────────────────┘
              src/shared/*  两端共用：类型、配置模型、provider 解析、显示逻辑
              tests/*       与 src 对应；tests/build 校验的是构建产物本身
```

- 宿主半边 **不 import 任何平台包**（只用结构化类型），唯一例外是 `@deepseek-ai/schemastery`（见 [`platform-notes.md`](platform-notes.md) 第 5 条）。
- 客户端半边只 require shell 模块表里的模块，**不引入 zod**（RPC codec 用手写校验器）。
- `lib/` 三个产物**提交入库**——`dsh plugin add github:...` 直接装仓库、没有构建步骤。
- 构建：`tsdown.config.ts`（宿主 ESM + 浏览器 CJS 闭包工厂）；清单：`cordis.patch.yml`（插入行）+ `package.json` 的 `dsh.bundle.patch` / `dsh.client.platform`。

## 2. 代码地图

### 宿主半边（`src/index.ts` + `src/host/`）

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 插件入口：装配全部依赖；`ctx.on('session/event')` 的 `turn/end` → 延迟刷新；`provideUsageState` 打上 `typertRemote` 绑定并 `ctx.provide` |
| `src/host/sources/types.ts` | 数据源契约：`request` / `parse`（纯函数）/ `credentialRefs(mode)` / `defaultBaseUrl(mode)` / `fallbackRequests` / `SourceError(kind)` |
| `src/host/sources/normalize.ts` | 归一化工具：`toFiniteNumber` / `clampPercent` / `normalizePercent` / `normalizeResetAt` / `normalizeBaseUrl` |
| `src/host/sources/deepseek.ts` | DeepSeek 余额（多币种乱序挑选、保留赠送/充值构成） |
| `src/host/sources/zai.ts` | z.ai / GLM：三种返回形态、`unit` 语义、200 错误信封识别、国内/国际镜像 |
| `src/host/sources/kimi.ts` | Kimi：API 模式查 Moonshot 余额、Coding Plan 模式查 Kimi Code 订阅窗口（需 CLI UA） |
| `src/host/sources/opencode.ts` | OpenCode Zen Go：`GET /zen/go/v1/usage`（**必须带浏览器 UA**，否则 Cloudflare 1010）；`rolling/weekly/monthly` → `5h/7d/30d`；根级 `usage` 与 `data.usage` 两种信封；401/403 = 无订阅/密钥无效 |
| `src/host/sources/sub2api.ts` | Sub2API `GET /v1/usage`，全程容错（字段曾漂移） |
| `src/host/sources/_template.ts` | 新数据源骨架（进 `tsc` 检查，不会腐化） |
| `src/host/sources/index.ts` | `ALL_SOURCES` 注册表 + `findSource` |
| `src/host/catalog.ts` | `toSourceCatalog`：把适配器元数据压成纯 JSON 过 RPC（浏览器不能 import 宿主代码） |
| `src/host/credentials.ts` | 凭据候选顺序与解析：`orderedCredentialRefs` / `resolveApiKey` / `describeCredentials`（永不返回密钥值） |
| `src/host/credential-fallback.ts` | 最后兜底：平台服务报"未配置"时直读 env → `$DSH_HOME/.credentials.yaml`，来源标注 `(direct)` |
| `src/host/provider-refs.ts` | 从 DSH provider 配置推导 `apiKeyEnv` 与端点（`llm-deepseek` / `llm-pi-ai`） |
| `src/host/settings.ts` | 设置命名空间 `usage-state`：`Config = z.any().volatile()` + `apply(ctx, config)` 根引用读取 + `configEditor` 跨条目读取（0.2 模型，修订 17） |
| `src/host/targets.ts` | 把 provider 列表解析成轮询目标（`source+mode` 去重、携带端点） |
| `src/host/read.ts` | HTTP 读取层：多端点（镜像）按序尝试、失败归类、超时 |
| `src/host/refresh.ts` | `UsageStateStore`：最小间隔、失败不节流、在途去重、回合结束后延迟刷新、空闲定时 |
| `src/host/service.ts` | RPC 服务面：`getState(force)` / `describeCredentials()` |
| `src/host/typert.ts` | Typert 宿主清单（zod v4 严格 codec） |

### 客户端半边（`src/client/`）

| 文件 | 职责 |
|---|---|
| `src/client/index.tsx` | 客户端入口：注册词典、绑定设置作用域、`$mount` RPC 贡献、轮询与事件触发的刷新、插槽注册（状态行 + 设置页） |
| `src/client/contribution.ts` | Typert 客户端契约镜像：`remote.$mount()` 交给平台的对象。strict codec 带 `create()` 工厂（0.2 registry 硬要求，修订 18），浏览器产物不引入 zod |
| `src/client/slots.ts` | 挂载点即数据：唯一挂载点 `conversation.input.dock`（`order: 200`，输入框上方独立一行）+ 测试守卫（禁止回合级插槽回归，修订 13/20） |
| `src/client/status-source.ts` | 状态行消费的 store 切片（`UsageStateSnapshotSource`）：组件不依赖 store 全表面，测试可传字面量 |
| `src/client/StatusLine.tsx` | 状态行组件：SVG 进度环（平台 `ContextMeter` 同款几何，`currentColor` 传导 severity 变色，修订 23）、排版照抄平台统计行（修订 22）、平台 `Tooltip` 承载细节 |
| `src/client/status-text.ts` | `StatusSegment` → 可渲染 parts（含每个部分的 tooltip 文案与分隔符同盒结构，纯函数） |
| `src/client/store.ts` | 浏览器侧读数镜像：失败不覆盖旧数据、并发共享在途调用、模型目录通道、RPC 失败可见（`failRemote`） |
| `src/client/settings-form.ts` | `configForms` → settings scope 适配器：`normalizeConfig` 在此解码、快照按底层引用缓存（修订 17） |
| `src/client/SettingsSection.tsx` | 设置页：provider 四态、上/下移、模型清单、显示设置（阈值/进度环/刷新间隔）、高级区（数据源覆盖/端点/凭据名/密钥写入）；卡头部是两列网格，名字过长只截断灰色 id（修订 12） |
| `src/client/provider-rows.ts` | provider 行构建、模式设置、顺序调整（纯函数） |
| `src/client/model-rows.ts` | 模型行类型与 provider 存在性判定（`routableProviders`——catalog 会过滤零模型的 provider，存在性必须问 registry） |
| `src/client/remote.ts` | `remoteService(ctx, name)`：用 `ctx.get` 读远程命名空间（`ctx.remote.X` 属性访问需要 inject，不能用于自己贡献的命名空间） |
| `src/client/locales.ts` | 中英词典（`en` 以 `zh` 的键联合类型约束）+ `LocaleNamespaceMap` 增强 |
| `src/client/context.ts` | 平台服务的结构化类型镜像（避免 host/client 类型合并冲突与运行时依赖） |
| `src/client/hooks.ts` | `useStoreState` / `useSettingsValue` / `useNow` |

### 两端共用（`src/shared/`）

| 文件 | 职责 |
|---|---|
| `types.ts` | 读数/快照/schema 无关的类型 |
| `config.ts` | 配置模型 + `normalizeConfig` 归一化 + 旧模型迁移 |
| `providers.ts` | provider → 数据源+模式的解析（`resolveProvider`、`PROVIDER_HINTS` 顺序即语义） |
| `display.ts` | 格式化、阈值 severity、段构建、`SourceCatalog` 压缩类型 |
| `rpc.ts` | 跨 RPC 的线上类型 |

## 3. 设计决策 → 实现 → 测试 → 验证

| 决策 | 实现 | 测试 | 验证程度 |
|---|---|---|---|
| 只做余额/额度显示，砍掉计费 | 代码库无价格目录/账本/历史模块 | — | 结构上可验证（模块不存在） |
| 五家数据源 | `host/sources/{deepseek,zai,kimi,opencode,sub2api}.ts` | `tests/sources/*`（63 例） | **DeepSeek / z.ai / OpenCode Zen Go 真机**；Kimi / Sub2API 仅单测（本机无凭据，见 [`backlog.md`](backlog.md)） |
| provider 级配置（修订 1） | `shared/config.ts` + `shared/providers.ts` + `client/provider-rows.ts` | `config` / `providers` / `provider-rows` | 真机（provider 行 + "自动识别为 …"） |
| 零配置 `auto`（修订 2） | `providers.resolveProvider` + `targets`（宿主用 `ctx.llm.listProviders()` 枚举 provider） | `providers` / `targets` / `entry` | 真机（未配置也读到了 DeepSeek 余额） |
| 模式选项按数据源能力过滤 | `provider-rows.modes` + `providers.resolveProvider`（`unsupported` 不静默替换） | `provider-rows` / `providers` | 真机（DeepSeek 不出现 Coding plan） |
| 凭据自动复用（不用手配） | `credentials` + `provider-refs` + `credential-fallback` | `credentials` / `provider-refs` / `credential-fallback` | 真机（设置页显示 `DEEPSEEK_API_KEY 已配置`，来源标注） |
| 密钥写入走平台凭据库 | `client/SettingsSection`（`remote.credentials.set/unset`）+ `writable` 透传 | `render` + `credentials` | 结构 + 单测（本机未真正写过密钥，见 [`backlog.md`](backlog.md)） |
| 设置命名空间 `usage-state` + 自定义页（修订 17） | `host/settings.ts`（volatile `Config`）+ `client/settings-form.ts` + `client/SettingsSection.tsx` | `settings` / `render` / `settings-form` | 真机（页面可用、四态与排序即时生效） |
| 卡头部不换行（修订 12） | `client/SettingsSection.tsx` 的样式常量（`HEADER` / `NAME` / `CONTROLS`） | `render`（长名用例：网格 + ellipsis + `flex-shrink:0` + `title`） | 真机（用户截图确认过漂移问题，网格形态已验收） |
| RPC 通道（Typert） | `host/typert.ts` + `host/service.ts` + `client/contribution.ts`（`$mount`） | `typert` / `service` / `entry` / `contribution`（真实 0.2 registry）/ `bundle`（产物 + 真实 registry） | 真机 + **平台 `validateTypertManifest`** + 真实 registry 契约测试（修订 18） |
| 状态行挂一处（修订 13/20：`conversation.input.dock`，输入框上方独立一行） | `client/slots.ts`（挂载点即数据）+ `client/index.tsx` + `client/StatusLine.tsx` | `slots`（唯一 + order > 20）/ `render`（整行几何） | 真机确认可见（截图）；回合级插槽已被守卫禁止 |
| 进度环 + 阈值变色（修订 23） | `StatusLine.tsx` 的 `ProgressRing`（平台 `ContextMeter` 几何，`stroke: currentColor`）+ `display.severityOf` | `render`（环几何、`currentColor`、无 `█░` 残留）/ `display` | 真机（正常态截图）；**琥珀/红高阈值视觉无真机样本**（[`backlog.md`](backlog.md)） |
| 排版对齐平台统计行（修订 22） | `StatusLine.tsx` 的 `BASE_STYLE`（照抄 `StatsPills` 两条显式表达式） | `render`（断言表达式存在、无 `font:inherit`） | 真机（用户确认字号一致） |
| 刷新：回合结束 +2s、空闲 5min、最小 60s | `host/refresh.ts`（时钟注入）+ `src/index.ts` | `refresh`（假时钟）/ `entry` | 单测精确覆盖；真机间接（数值随时间变化） |
| 失败保留旧值 + 陈旧时间 + ⚠ | `refresh.fail` + `display.describeStatus` + `status-text` | `refresh` / `display` / `status-text` / `render` | 真机（`⚠ …` 截图）+ 单测 |
| 悬浮提示（修订 5） | `status-text` 生成 tooltip + `StatusLine` 用平台 `Tooltip` | `status-text` / `render`（断言 tooltip） | 真机（用户确认） |
| 中英双语跟随 DSH 语言 | `client/locales.ts`（键集一致性有测试） | `locales` / `render` | 真机（英文界面 + 中文词典） |
| 构建与发布 | `tsdown.config.ts` / `package.json` / `cordis.patch.yml` / `lib/` | `bundle`（信封、require 白名单、产物端到端） | 真机安装 + 从 GitHub/npm 安装实测（流程见 [`release.md`](release.md)） |

## 4. 已验证的证据

- **真机读数**：DeepSeek 余额随消耗变化（`¥58.23 → 58.18 → 58.13 → 57.19`）；z.ai `5h 12% (4h0m) · 7d 59% (3d17h)`（当时为文字进度条形态，0.4.3 起为圆环）；OpenCode Zen Go 三窗口 + 输入框上方独立一行（当前截图）。
- **本机离线复现**：用真实密钥直连 `GET /user/balance` 跑通整条宿主链路（含解析、目标解析、凭据解析）。
- **平台校验器**：`@deepseek-ai/dsh-typert-loader` 的 `validateTypertManifest` 接受我们的清单（已固化为测试）。
- **真实 registry 契约**：源码与构建产物两条路径都把 contribution 注册进真实 0.2 `@deepseek-ai/dsh-typert-registry/client` 并要求 endpoint 可解析（修订 18 之后）。
- **产物级**：`lib/index.js` 用假宿主端到端跑通；`lib/client.js` 信封与 require 白名单受测试保护。
- **发布路径**：`npm install github:takboo/dsh-usage-state` → 宿主入口可加载、typert 清单可用、client bundle 随包发布、`cordis.patch.yml` 到位；npm 源与市场收录的核验记录见 [`release.md`](release.md) 与 [CHANGELOG](../CHANGELOG.md)。
- **卸载**：web profile 的 `dependencies` / `dsh.profile.bundles` / `node_modules` 均无 `dsh-cost-meter`（被本插件替代）。
