# dsh-usage-state — 设计共识

> 状态：**已实现、已在本机验收、已发布**（进度见 [CHANGELOG](../CHANGELOG.md)，发布流程见 [`release.md`](release.md)）。
> 本文件描述**当前有效**的设计；与初版共识（2026-09-20 grilling 结论）的差异全部记录在 [`design-changelog.md`](design-changelog.md)（修订 1–23），正文只保留结论、标注出处修订号。
> 事实依据：[`research/`](research/README.md) 下的只读侦察文档（是材料，不是共识）。

## 0. 一句话

一个只做「余额 / 额度显示」的 DSH 插件，替代 `dsh-cost-meter` 的展示需求，砍掉它全部的计费逻辑；设置页中英双语，**供应商清单自动发现、零配置可生效**、顺序可调。

## 1. 目标与非目标

**做**：读 DSH 已配置的供应商（provider）→ 按序展示 → 为每个供应商选「自动 / API / Coding Plan / 隐藏」→ 按模式显示余额或 5h/7d/30d 已用百分比（含重置倒计时、阈值变色、SVG 进度环）。读数是**账户级**的，因此配置单元是供应商而不是模型（修订 1）。

**不做**（成本插件的复杂度来源，全部砍掉）：会话成本统计、模型价格目录与自动匹配、历史账单、预算图框、峰谷计价与通知、native-search 计费、CLIProxyAPI/网关额度、SCNet/Qwen 本地估算、自定义余额端点、会话日志回填与修复 CLI。完整护栏见 [`backlog.md`](backlog.md) §5。

## 2. 数据源（v1 实现 5 家）

各厂商的**端点、字段语义与陷阱**以 [`adapters.md`](adapters.md) 的已实现数据源表为单一事实源，此处只留设计层结论：

| 数据源 | 模式 | 接口 | 设计要点 |
|---|---|---|---|
| DeepSeek 官方 | API | `GET /user/balance` | 只有余额，无 coding plan、无窗口 → 设置页对 DeepSeek 只提供「API / 隐藏」 |
| z.ai / 智谱 GLM | Coding Plan | `/api/monitor/usage/quota/limit`（国内默认，国际镜像） | 鉴权失败表现为 HTTP 200 信封，必须识别成"密钥无效"；区域 key 互不通用 → 镜像重试；旧路径作兜底 |
| Kimi（国内版） | API | Moonshot 余额 | 一家两种读法：按模式分派端点与密钥 |
| Kimi（国内版） | Coding Plan | Kimi Code 订阅窗口 | 需 CLI UA；周窗口 + 5h 窗口 |
| OpenCode Zen Go | Coding Plan | `/zen/go/v1/usage`（修订 11） | 5h/7d/30d；两条 DSH 路由进同一账户按 `source:mode` 去重，只发一次请求 |
| sub2api（自建） | API / Coding Plan | `{baseURL}/v1/usage` | 一个接口覆盖两种模式；**未文档化接口、字段漂移过 → 按易碎适配器实现** |

**其余厂商只留契约与文档**（Claude Pro/Max OAuth、MiniMax、OpenRouter、SiliconFlow、CommandCode、Codex/ChatGPT、Antigravity、Gemini Code Assist、Volcengine Ark、Moonshot 国际版等）：候选清单与优先级建议统一放在 [`backlog.md`](backlog.md) §3，契约模板见 [`adapters.md`](adapters.md) + `src/host/sources/_template.ts`，不写实现。

## 3. 供应商清单与配置

- **自动发现**：客户端 `ctx.remote.session.modelCatalog()`（`buildModelCatalog` 不需要 Session，设置页可用）→ `groups[].{id,name,models[]}`；宿主侧用 `ctx.llm.listProviders()` 枚举供应商（这是"零配置也能读到数据"的关键）。provider 的**存在性**以 registry 的 routable 列表为准，不以 catalog 为准（catalog 会过滤零模型的 provider，见 `client/model-rows.ts`）。
- **每个供应商四态**：`auto`（默认）/ `api` / `coding-plan` / `hidden`。选项按该供应商解析出的数据源能力过滤（例如 DeepSeek 不出现 `coding-plan`）。
- **顺序用上/下按钮调整**（平台没有拖拽/排序原语，修订 3）；`hidden` 的供应商不进任何状态行。
- **配置只存"偏差"**：`auto` = 按 provider id 与端点推断数据源 + 取该源的主模式；自建源（需要端点）在没填端点前保持休眠并明确提示。
- **端点优先级**：插件设置里显式填的端点（钉死，不试镜像）→ 供应商声明的 `baseURL`（取其 origin，仍试镜像）→ 适配器默认。
- **配置存储**：DSH 设置命名空间 `usage-state`——它是**插件自己的 profile 条目 id**：宿主导出 `Config = z.any().volatile()`，客户端用 `ctx.configForms.get('usage-state')` 读写，落盘由平台 settings 服务完成（修订 17）。不使用插件自有配置文件。旧的按模型条目在 `normalizeConfig` 里自动迁移成供应商条目。

## 4. 密钥

- **探测顺序**：设置页覆盖 → 该 provider 配置里的 `apiKeyEnv`（`llm-deepseek` / `llm-pi-ai` 的 provider profile）→ 数据源内置 ref → DSH 凭据库（`ctx.get('credentials').resolve/describe`）。v1 五家全部使用 API key，不需要任何 CLI 登录文件。
- **最后兜底**（修订 6）：平台凭据服务报"未配置"时，按平台自身的优先级直读 进程环境 → `$DSH_HOME/.credentials.yaml`，并把来源标注为 `env (direct)` / `file (direct)`，避免静默掩盖平台路径的问题。
- **设置页每一行显示**：密钥来源 + 「可用 / 未配置」，并提供粘贴框写入 DSH 凭据库（`credentials.set`，落盘 `~/.dsh/.credentials.yaml`）。**插件自己不存明文**。
- 客户端不接触密钥值：只用 `ctx.remote.credentials.describe/set/unset`，传字符串 ref（客户端 bundle 禁止跨插件值导入，不能传 `credentialRef()` 的返回值）。
- 环境变量源是只读且优先级最高的：被它遮蔽时写入会被平台拒绝，UI 必须如实提示而不是假装成功。

## 5. 展示

**只有一个位置**：`conversation.input.dock`（`id: "usage-state"`、`order: 200`，排在平台排队消息 dock 之后）——**输入框上方、与输入卡片同宽的独立一行**（修订 20；0.2 里"输入框之下"只有与平台统计共排的一排 pill，没有整行位置）。原生 `StatsPills` 与上下文计量器**原样保留**，不做影子替换、不复刻（修订 4）。回合级插槽一律不用（修订 13，账户级读数不放在回合上；`slots.ts` 的测试守卫禁止回合插槽回归）。

几何与排版（照抄平台显式声明，缺变量时优雅退化）：

- 整行块：`width:100%` + `max-width: var(--dsh-composer-card-max-width)` + `margin:0 auto` + `padding: 0 var(--dsh-composer-side-clearance)`（与平台排队消息 dock 同构）。
- 字号/行高**照抄** `StatsPills` 的显式表达式（修订 22）：`calc(var(--dsh-content-font-size-secondary, 13px) - 1px)` / `calc(20px + var(--dsh-content-font-delta-secondary, 0px))`——不写 `font:inherit`（继承链不同会吃到输入卡片的 14px），也不设 `font-family`（让 UI 字体插件照常生效）。
- `flex-wrap: wrap` + 分隔符与它引导的段落同盒（`data-usage-part`，修订 21）：窄窗口下在**段与段之间**折行，永远不裁切、不出现孤立的 `·`。

- **数据归属**：跟随**会话当前选择的模型** → 解析出它的数据源（provider + 模式）→ 显示该源的数据。会话中途切换模型，整行跟着换。
- **显示元素**：标签（provider 名，陈旧时前置 `⚠`）· 各窗口：**SVG 进度环 + 已用百分比 + 重置倒计时** · 余额金额 + 币种。
- **进度环**（修订 23）：平台 `ContextMeter` 同款几何（14×14、r=5.5、2px 描边、12 点起弧），替代 `█`/`░` 文字条——矢量没有字形度量，整类宽度问题消失。进度弧 `stroke: currentColor`，severity 颜色自动传导；轨道用平台的 `--dsw-alias-border-l3`。环在文字之前（平台 `◐ 1%` 的排法）。`display.progressBar` 配置键保留（改名会破坏既有配置），关掉即隐藏环。
- **阈值变色**：`severityOf` 按已用百分比定级——≥ `thresholdWarnPercent`（默认 80）琥珀（`--dsw-alias-state-warn-primary`）、≥ `thresholdCriticalPercent`（默认 95）红（`--dsw-alias-state-error-primary`）、否则灰（`--dsw-alias-label-secondary`）；颜色作用于整段（含环）。**高阈值的真机视觉样本仍缺**（读数长期低于阈值），见 [`backlog.md`](backlog.md)。
- **口径**：**已用百分比**（与 z.ai / Claude 官方一致）。API 模式显示余额，Coding Plan 模式显示该源实际提供的窗口（z.ai 与 Sub2API 是 5h/7d，OpenCode Zen Go 多一个 30d）。
- **降级**（绝不显示 0 或伪造数据）：

| 情况 | 显示 |
|---|---|
| 自己的 RPC 还没回答（catalog 为空） | 「读取中」（不误报"模式不支持"，修订 18） |
| 未配置 / 推断不出数据源 | 灰色「未配置」 |
| 自建源缺端点 | 「需要先填写接口地址」 |
| 请求失败（有旧值） | 旧值 + `⚠` + 多久之前，悬浮给出原因 |
| 首次失败（无旧值） | 只显示本地化原因 |
| RPC 本身失败 | 状态行直接说失败原因（`errorDetail` 进悬浮提示） |

- **悬浮提示**（修订 5）：每个部分悬停显示"一行放不下的信息"——数据源 + 模式、窗口的绝对重置时刻（本地时间）、余额的赠送/充值构成、失败原因 + provider 原始消息、陈旧读数的更新时间。"可点进设置"未实现（客户端没有公开的"打开设置面板"服务），见 [`backlog.md`](backlog.md)。

## 6. 刷新

宿主单例服务 + 按数据源缓存（数值可在设置调整，`config.refresh`）：

- 回合结束（宿主 `ctx.on('session/event')` 的 `turn/end`）→ **延迟 2s** 刷新全部已配置目标（等 provider 结算；实现为 `refreshAll`，比"只刷该会话的数据源"更简单且不会漏掉并行使用）。
- 空闲 **5 分钟**定时兜底（`ctx.interval`，随插件 fiber 自动清理；客户端没有 timer 插件，前端不做定时拉取）。
- 每个数据源 **最小 60s** 内不重复发真实请求；进行中请求去重；失败不节流（可立即重试）；将来接 OAuth 类接口时按 `Retry-After` 退避。

## 7. 数据通道

- **配置**：设置命名空间 `usage-state`（= 条目 id），客户端 `ctx.configForms.get()` 原生读写，宿主 `apply(ctx, config)` 拿平台给的**易变根引用**读、`loader/volatile-update` 跟随（修订 17）。
- **易变快照**：只读 RPC（`ctx.remote.$mount` + Typert 清单），方法面保持最小：**`getState(force)`** 与 **`describeCredentials()`**（force 用于设置页的「立即刷新」）。客户端必须用 `ctx.get('remote.usageState')` 读取（属性访问需要 inject，而该命名空间是本插件自己贡献的，修订 7）；客户端 contribution 的 strict codec **必须带 `create()` 工厂**（0.2 registry 硬要求，修订 18），且 mount 失败不允许静默。
- 宿主只发**原始数据**（数字、id、时间戳），**文案全部由客户端词典本地化**（平台原生做法，避免 cost-meter 那种宿主/客户端两套字典）。

## 8. 语言

中英双语，跟随 DSH 设置 `locale.preference` 的解析结果（没有 `'auto'` 值，缺失 `preference` 才回退到浏览器语言）。客户端 `ctx.locale.register('usage-state', {zh, en})` + 插槽声明 `locale: 'usage-state'` 拿到注入的 `t`。**不留任何硬编码字面量**（cost-meter 的漏网字符串是它"看着不像中文"的一部分原因）。

## 9. 工程形态

- **TypeScript + `tsdown` 构建**，产出宿主 `lib/index.js`、`lib/typert.js` 与客户端 `lib/client.js`（不产出 `.d.ts`：运行时消费不需要，见 [`backlog.md`](backlog.md)）；解析器用 `node:test` 写单测。三个产物**提交入库**（GitHub 安装没有构建步骤）。
- 包名 `dsh-usage-state`；插件/profile 条目 id 与设置命名空间 `usage-state`；`package.json` 的 `dsh` 字段声明 `bundle.patch` + `client.platform: "web"`；`cordis.patch.yml` 里 `insert` 一行（带 `config: {}`）。
- **兼容声明**：平台 manifest schema **没有** `compatibility` 字段；版本要求用 `engines.dsh` 表达（市场读它做徽标与兼容判定，当前 `>=0.2.0-rc.2 <0.3.0-0`，修订 17；区间推导与教训见修订 14/16）。`peerDependencies` 声明 `@deepseek-ai/dsh-settings` 是**故意的**——让 0.1.x 宿主的运行时安装闸门在安装时拒绝，而不是装上后把启动搞崩。
- 平台行为的实测事实（模块回落、事件不可写、槽位侦察等）统一沉淀在 [`platform-notes.md`](platform-notes.md)。
- 文档结构见[下节](#10-文档结构)。

## 10. 文档结构

| 文档 | 读者 | 内容 |
|---|---|---|
| [`../README.md`](../README.md) / `README.en.md` | 用户 | 安装、特性、数据源、显示行为、兼容性 |
| [`../CHANGELOG.md`](../CHANGELOG.md) | 用户/维护者 | 按版本的变更记录 |
| [`adapters.md`](adapters.md) | 扩展者 | 适配器契约、步骤、**厂商端点与陷阱（单一事实源）**、排查表 |
| [`design-consensus.md`](design-consensus.md)（本文件） | 维护者 | 当前有效的设计 |
| [`design-changelog.md`](design-changelog.md) | 维护者 | 修订 1–23：每条决策变更的原决策 → 现决策 → 原因 |
| [`architecture.md`](architecture.md) | 维护者 | 代码地图、决策→实现→测试→验证追溯、证据 |
| [`release.md`](release.md) | 发布者 | 发布流程、六步端到端验证、人工验收清单、市场收录链路 |
| [`platform-notes.md`](platform-notes.md) | 维护者 | DSH 平台行为的实测事实（跨版本注意时效） |
| [`backlog.md`](backlog.md) | 维护者 | **唯一待办清单**：未验证、未实现、候选数据源、维护项、否决护栏 |
| [`research/`](research/README.md) | 维护者 | 只读侦察材料（是材料，不是共识） |

## 11. 交付与验收

1. 本仓库开发 → 装入 web profile 验收（真机步骤见 [`release.md`](release.md) 的验收清单）。
2. 验收项：设置页（供应商清单、密钥检测、四态、排序）、状态行（输入框上方独立一行、圆环、悬浮提示、失败降级）、中英跟随。
3. 发布前跑 [`release.md`](release.md) 的**六步端到端安装验证**（判据是"入口激活"，不是"入口在列"——修订 16/17 的两次翻车都栽在这）。
4. 替代插件 `dsh-cost-meter` 已从 web profile 卸载，状态行无重复。
5. npm 发布 + dsh-market 收录流程见 [`release.md`](release.md)；已收录（分类 `usage`）。

## 12. 风险与未验证项

当前完整清单统一维护在 [`backlog.md`](backlog.md)（§1 未真机验证、§2 未实现、§4 维护项），此处不再另列。历史决策中"已结案"的风险（回合行、两线兼容等）见 [`design-changelog.md`](design-changelog.md) 对应修订。
