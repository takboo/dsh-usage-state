# dsh-usage-state

**中文** | [English](README.en.md)

在 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai) 里一眼看到你的**账户余额**或**套餐额度**——就在输入框上方、与输入卡片同宽的一行（原生统计行与其弹窗原样保留、不做替换）。

> A minimal DSH plugin that shows your account **balance** (API mode) or **coding-plan quota** (5h / 7d / 30d) for the model you are using, right under the composer.

```
输入框上方独立一行：      z.ai / GLM · 5h 12% (4h0m) ▓▓▓░░░░░ · 7d 59% (3d17h) ▓▓▓▓▓░░░
                        DeepSeek · ¥58.13
悬停任意一段：          Source DeepSeek · Mode API balance · Granted 0 · Topped up 58.13
```

## 特性

- **零配置可用**：按 provider 自动识别该用哪个数据源与模式，DSH 里配过的密钥会被自动复用，不填任何东西就能看到读数。
- **账户级配置**：余额与额度是账户级的，所以每个供应商只配一次（`自动` / `API` / `Coding Plan` / `隐藏`），模型清单只作展示。
- **始终可见一行**：独占一行、位于输入框上方（DSH 0.2 把它挂在 `conversation.input.dock`，与输入卡片同宽居中；原生统计行与上下文计量器原样保留、不做替换），不需要悬停或点击。
- **失败不撒谎**：请求失败时保留上次成功值并标明「多久之前 + ⚠」，**绝不显示 0 或伪造数据**；密钥无效、接口报错、网络不可达会分别给出可读原因。
- **悬浮提示**：每段文字悬停显示一行放不下的信息——数据源与模式、窗口的绝对重置时刻、余额的赠送/充值构成、失败原因与原始消息。
- **中英双语**：跟随 DSH 的语言设置（`locale.preference`），设置页与状态行都不含硬编码文案。
- **只做显示**：只有余额与额度，没有成本统计、价格目录、历史账单、预算、峰谷计价。

## 安装

**前置条件**：DSH `0.2.0-rc.2` 或更新的 0.2 线、Node ≥ 20，装进 `web` profile。包内**自带预构建的 `lib/`**，安装时没有构建步骤。
**用 0.1 线请装 `0.3.2`**：DSH 0.2 换掉了整套设置 API（`settingsScope` / `settings.register` → `configForms` / 插件自带 `Config`），两套 API 没有重叠，所以 `0.4.0` 起只支持 0.2 线（原因见 [`docs/design-consensus.md`](docs/design-consensus.md) 修订 17）。

```bash
# 1) 安装（npm 包）
dsh plugin --profile web add dsh-usage-state

# 2) 重启 DSH —— 插件的 bundle patch 只在启动时读取

# 3) 卸载
dsh plugin --profile web remove dsh-usage-state
```

直接从 GitHub 安装（内容与 npm 上的一致）：

```bash
dsh plugin --profile web add github:takboo/dsh-usage-state
```

本地开发时可直接装目录（宿主半边改完同样要重启 DSH）：

```bash
dsh plugin --profile web add /path/to/dsh-usage-state
```

也可以在 [dsh-market](https://github.com/dsh-market/dsh-market) 里搜索 `usage state`（或 `takboo`）一键安装——本插件已收录在精选列表 [awesome-dsh-plugin](https://awesome-dsh-plugin.com) 的「用量与计费」分类。

装好后界面没有出现？见 [`docs/adapters.md`](docs/adapters.md) 末尾的排查表。

## 快速开始

1. 打开 **设置 → 用量状态**：DSH 里配置的每个供应商一行。
2. 保持默认的 **自动** 即可（它会识别数据源与主模式）；需要时改成 `API` / `Coding Plan` / `隐藏`，或用 ↑↓ 调整顺序。
3. 该供应商的账户读数会出现在输入框上方、与输入卡片同宽的一行。

若某个数据源需要端点或密钥（例如自建的 Sub2API、或尚未配置的 z.ai），展开该行的 **高级**：可覆盖数据源、填接口地址、指定凭据名、粘贴密钥（写入 DSH 凭据库）。

供应商名过长时，卡片头部只截断灰色的 provider id（悬停显示全文），右侧的 `↑ ↓ 自动 / Coding Plan / 隐藏` 不会换行。

## 截图

输入框上方独占一行的账户读数（图示为 OpenCode Zen Go 的三个窗口；卡片下方那排是 DSH 原生统计，两者互不干扰。悬停任意一段可看数据源、模式与绝对重置时刻）：

![输入框上方独占一行的账户读数](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/status-line.webp)

设置页：每个 provider 一行，默认「自动」会识别数据源与主模式：

![设置页的供应商列表](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-providers.webp)

展开「高级」可覆盖数据源与端点、指定凭据名，或写入密钥（写入 DSH 凭据库）：

![高级区](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-advanced.webp)

## 支持的数据源

| 数据源 | API 模式 | Coding Plan 模式 | 凭据 |
|---|---|---|---|
| DeepSeek 官方 | 余额（CNY / USD） | —（官方无 coding plan） | `DEEPSEEK_API_KEY` |
| z.ai / 智谱 GLM | — | 5h / 7d 已用 % | `ZAI_API_KEY` 等 |
| Kimi 国内版 | Moonshot 按量余额 | Kimi Code 订阅窗口 | `MOONSHOT_API_KEY` / `KIMI_CODING_API_KEY` |
| OpenCode Zen Go | — | 5h / 7d / 30d 已用 % | `OPENCODE_GO_API_KEY` / `OPENCODE_API_KEY` |
| Sub2API（自建网关） | 余额 / key 配额 | `rate_limits[]` 的 5h / 7d | `SUB2API_API_KEY` + 实例地址 |

- **z.ai 分区域**：coding plan 的 key 只在自己区域的站点有效（国内 `open.bigmodel.cn` / 国际 `api.z.ai`）。默认国内站，失败时自动镜像重试；也可在设置里钉死端点。
- **OpenCode Zen Go**：读 `opencode.ai/zen/go/v1/usage` 的 `rolling` / `weekly` / `monthly`；通往同一账户的两条 DSH 路由（内置 `opencode-go` 与自定义 `opencode-go-deepseek`）只产生一个读数、只发一次请求。无订阅或密钥无效时报鉴权失败，而非 0%。
- **其他厂商**（Claude Pro/Max、MiniMax、OpenRouter、Codex、Antigravity、Volcengine Ark…）未实现，但适配器契约与候选清单已备好，见 [`docs/adapters.md`](docs/adapters.md)。

## 显示与交互

**位置**：输入框统计行的正下方（与原生统计行的几何对齐，跟随 DSH 的会话内容宽度）。读数**始终可见**，不依赖悬停，也不需要点击。

**元素**：供应商标签 · 余额金额 + 币种 · 各窗口（5h / 7d / 30d）已用百分比 · 重置倒计时 · 迷你进度环 · 阈值变色（默认 ≥80% 黄、≥95% 红，可在设置里改）。

**口径**：百分比一律是**已用**（与 z.ai / Claude 官方一致）；API 模式显示余额，Coding Plan 模式显示该数据源实际提供的窗口（z.ai 与 Sub2API 是 5h / 7d，OpenCode Zen Go 多一个 30d）。

**降级**：

| 情况 | 显示 |
|---|---|
| 未配置 | 灰色「未配置」 |
| 自建源缺端点 | 「需要先填写接口地址」 |
| 请求失败（有旧值） | 旧值 + `12m ago` + `⚠`，悬停给出原因 |
| 首次失败（无旧值） | 只显示本地化原因（不显示 0） |

## 刷新与网络

- 回合结束后 **2 秒**刷新（等 provider 结算），空闲时每 **5 分钟**兜底。
- 同一数据源 **60 秒**内不重复发真实请求；并发调用共享同一次在途请求；失败的请求不节流（可立即重试）。
- 刷新间隔可在设置里调整。

## 凭据与隐私

- 凭据探测顺序：设置页覆盖 → 供应商声明的 `apiKeyEnv`（`llm-deepseek` / `llm-pi-ai`）→ 数据源内置的 ref 名 → DSH 凭据库。
- 密钥在设置页写入 **DSH 凭据库**（`~/.dsh/.credentials.yaml`）；**插件自身不保存明文**。客户端只拿到「是否已配置 / 来源」，永远拿不到密钥值。
- 环境变量提供的密钥是只读的：界面会禁用输入框并说明原因。
- 插件读取的内容只有余额/额度数字与会话当前使用的模型，**不写会话日志**，也不上报任何数据。

## 兼容性

- **只支持 DSH 0.2 线**：`engines.dsh` = `>=0.2.0-rc.2 <0.3.0-0`（市场读它做徽标与"可安装"判定）。0.2 之前的宿主请装 `0.3.2`。
- `peerDependencies` 里有 `@deepseek-ai/dsh-settings`（`^0.2.0-rc.2`）与 `@deepseek-ai/schemastery`（`^3.18.2`）：前者是**故意的**——平台的运行时安装闸门只读 `@deepseek-ai/dsh*` 的 peer，声明它可以让 0.1.x 宿主在**安装时**就拒绝，而不是装上之后把启动搞崩；两者都由平台提供，pnpm 可能为此打一行 `missing peer` 警告，属预期。
- 版本 `0.4.2`：状态行迁到 `conversation.input.dock`，成为**输入框上方的独立一行**（0.1 时代它在输入框之下，而 0.2 把那个位置改成了与平台统计、上下文计量器共排的一排 pill——见修订 19/20）。
- 版本 `0.4.1`：修 `0.4.0` 的读数缺失——客户端 RPC contribution 的参数 codec 少了 0.2 要求的 `create()`，`remote.usageState` 因此从未挂载，界面表现为**没有任何读数**并误报 `Mode not supported`。同一轮还让挂载失败不再被静默吞掉、catalog 未到时改说「读取中」，并把**真实 0.2 registry 契约测试**写进单测（修订 18）。**请用 `0.4.1`，不要用 `0.4.0`。**
- 版本 `0.4.0`：迁到 0.2 原生设置模型（`Config` + `configForms`，宿主侧 `configEditor` 读跨条目配置）。验证方式与结论见 [`docs/implementation.md`](docs/implementation.md) §10、决策见 [`docs/design-consensus.md`](docs/design-consensus.md) 修订 17。
- 版本 `0.3.2`（0.1 线末版）：仅放宽 `engines.dsh`；**它声称的 0.2 兼容是错的**（0.3.2 在 0.2.0-rc.2 上会因 `settingsScope` 不存在而让整个 web 启动失败）。
- 同名发布在 npm（[`dsh-usage-state`](https://www.npmjs.com/package/dsh-usage-state)），也可从 GitHub 直接安装。

## 已知限制

- **Kimi、Sub2API 未经真机验证**（本机无凭据），代码与单测已就绪；Sub2API 的 `/v1/usage` 属未文档化接口，已按易错接口做容错。
- **点击状态行不会打开设置**（客户端没有公开的"打开设置面板"服务）；细节通过悬浮提示呈现。
- **只在输入框上方展示，不覆盖历史**：状态行给出的是账户**当前**读数；插件不按回合、也不按时间保存历史读数，因此翻看旧回合时看不到"当时的余额"。若将来要做，会是以时间轴（而不是回合）为口径的单独决定。
- 完整清单见 [`docs/implementation.md`](docs/implementation.md) §6。

## 开发

```bash
npm install          # 若 ~/.npm 不可写：npm install --cache /tmp/npm-cache
npm test             # node:test 直接跑 .ts / .tsx（需要 Node >= 22.6）
npm run typecheck    # tsc --noEmit
npm run build        # tsdown → lib/（宿主 index.js + typert.js，浏览器 client.js）
npm run watch        # 只重建 client.js；客户端会被 HMR 热替换，无需刷新页面
```

**本地回路（不需要发版）**：`scripts/dev-local.sh` 会在 `/tmp/dsh-dev` 建一个**一次性 profile**，把本仓库以 `link:` 装进去并起一个独立端口的宿主；你的真实 profile 完全不受影响。

```bash
npm run build                 # 先有 lib/
scripts/dev-local.sh          # 建/复用 dev profile + 起宿主，打印带 token 的 URL
# 另一个终端：
npm run watch                 # 保存即重建 client.js
```

客户端改动由 `dsh-client-hmr` 热替换（宿主每 500ms 轮询 bundle，经 `/plugins/events` 通知浏览器重载模块）——**不用重启、不用发版**；宿主改动（`src/host/**`、`src/index.ts`、`cordis.patch.yml`）需要重启该脚本。

⚠️ **这个 profile 没有凭据**：`$DSH_HOME/.credentials.yaml` 是 home 级的，全新 home 里没有 key，也没有你其它插件（**字体插件会改变排版所依赖的字形度量**）。所以它只适合**结构/宿主侧**核对。要看**实际观感**，把同一份构建装进已有 key 与插件的 profile，同样不用发版：

```bash
npm pack --pack-destination /tmp --cache /tmp/npm-cache
dsh plugin --profile web add /tmp/dsh-usage-state-<version>.tgz   # file: 安装
dsh plugin --profile web add "$PWD"                               # 想热迭代就用 link:
dsh plugin --profile web add dsh-usage-state@<已发布版本>          # 回到线上版本
```

只有当你**亲眼确认**改动可用之后，才值得动版本号与 npm 发布。

宿主机改动需要重启 DSH；客户端改动 `npm run watch` 即可。`lib/` 产物**必须提交进仓库**——`dsh plugin add github:...` 直接装仓库、没有构建步骤（`npm test` 里的构建守卫会检查信封、require 白名单与 `exports` 指向）。

```
src/host/        宿主：数据源适配器、缓存调度、凭据、设置、RPC
src/client/      浏览器：词典、状态行、设置页、状态镜像
src/shared/      两端共用：类型、配置、provider 解析、显示逻辑
lib/             构建产物（提交，供 github 安装）
tests/           与 src 对应；tests/build 校验的是产物本身
```

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/implementation.md`](docs/implementation.md) | 实现与验证总览：代码地图、决策→实现→测试→验证追溯、未验证清单、平台注意事项 |
| [`docs/adapters.md`](docs/adapters.md) | 添加数据源：契约、四步流程、约定与坑、候选厂商、排查表 |
| [`docs/design-consensus.md`](docs/design-consensus.md) | 设计共识与修订记录（每条决策的来龙去脉） |
| [`docs/research/README.md`](docs/research/README.md) | 只读侦察报告索引（各厂商接口、被替代插件剖析、DSH RPC 契约） |

## 致谢与参考

- **[`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter)**（作者 Han-1413141，MIT 许可）：本插件是它的**简化替代品**——只保留「看余额 / 看 Coding Plan 额度」这个展示需求，砍掉计费、价格目录、历史账单、预算与峰谷提醒等全部逻辑（见上面的「只做显示」）。
  数据源端点、响应字段语义与若干兼容陷阱（OpenCode Zen Go 必须带浏览器 UA、z.ai 用 HTTP 200 + `{success:false}` 表达鉴权失败、旧 `coding_plan/usage` 兜底路径、sub2api 的 `rate_limits[]` 形态等）来自对 `dsh-cost-meter@1.7.28` 的**只读分析**，记录见 [`docs/research/dsh-cost-meter-analysis.md`](docs/research/dsh-cost-meter-analysis.md)。本仓库的实现是独立编写的 TypeScript，不是对其源码的照搬；但那些行为语义确实源自上述分析，应归功于上游。
  若上游作者认为某处需要更明确的署名或授权，请提 issue，我会立刻调整。
- **[DSH（DeepSeek Harness）](https://github.com/deepseek-ai)**：宿主平台。插件使用它的设置命名空间、凭据库、Typert RPC、插槽系统与 UI 原语（`@deepseek-ai/dsh-client-ui-primitives` 等）。

## 许可

[MIT](LICENSE)
