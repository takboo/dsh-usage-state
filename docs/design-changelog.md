# 设计修订记录（Design Changelog）

> 初版共识是 grilling 的产物（见 [`design-consensus.md`](design-consensus.md)）；真机实施暴露了它不成立或不够好的地方。以下每条都记录了"原决策 → 现决策 → 原因"，避免后人误读正文。
> **本文件是历史档案，按修订号追加，不回改旧条目**（发现旧条目与现状不符时，新写一条修订，不改动旧文）。当前有效的设计以 [`design-consensus.md`](design-consensus.md) 为准。

## 修订 1–23

1. **配置单元：模型 → 供应商**（`ccb9adc` / `8384738`）
   原文要求"为每个模型选模式"。但余额/额度是**账户级**的：同一 provider 下所有模型共享一份读数，逐模型配置既重复又冗长（用户实测反馈"太长、设置实际是重复的"）。改为每个 provider 一次，模型列表降级为只读映射视图。
2. **新增 `auto` 模式与零配置**（`ccb9adc`）
   原设计默认 `hidden`，用户必须先配置才显示。改为默认 `auto`：按 provider id 与端点推断数据源、取该源主模式；宿主用 `ctx.llm.listProviders()` 枚举 provider，因此**一行都不配也能读到正在使用的账户**。自建源（需要端点）保持休眠并明确提示。
3. **排序：拖动 → 上/下按钮**（`8384738`）
   平台 primitives 里没有任何拖拽/排序原语、连拖拽手柄图标都没有，实现拖拽要自己处理指针捕获、命中测试与键盘可达性。上下按钮是可访问的、十几行、且写入是原子的整个数组。
4. **状态行位置：影子替换 → 兄弟行**（grilling 中用户改主意）
   最初定的是"影子替换原生统计行"以便与统计同行；经讨论认为会过度拥挤且要复刻平台内部 UI，改为在统计行正下方另起一行（`order: 1`），原生 `StatsPills` 与其弹窗原样保留。
5. **点击弹窗 → 悬浮提示**（`002e571`）
   平台原生统计 pill 点击弹出明细，用户问"我们是否要做类似的"。结论：弹窗只显示现有信息会与设置页重复；要显示每个窗口的原始数字（used/limit/单位）必须先扩展数据模型。选择 (A)：不动数据模型，把细节放进每个部分的悬浮提示（数据源/模式/绝对重置时刻/余额构成/失败原因）。
6. **凭据探测增加直读兜底**（`6f45043`）
   真机上宿主行拿不到 `credentials` 服务（症状：一切都对但界面只说"未配置"）。兜底按平台自身优先级直读 env → `.credentials.yaml`，并标注来源 `(direct)`；若确认平台路径可用应删除。
7. **RPC 客户端读取方式**（`c93ed6d`）
   原文示意用 `ctx.remote.<ns>`。但属性访问要求该服务已在 `inject` 列表中，而 `remote.usageState` 是本插件 `$mount` 后才贡献的（写进 inject 会死等）。改用 `ctx.get('remote.usageState')`。
8. **回合行的"固定值 + Δ"**（已**否决**，见修订 13）
   用户原观察到回合动作条与 dock 的值同步，"不固定就没有意义"；方向因此定为"该回合结束时的固定值 + 较上一回合的变化量"，持久化首选 session log + 投影。
   动工前的可行性实验（读取侧校验器会不会拒绝"未知类型且不带 `ignorable`"的事件）给出否定答案：`Session.append()` 写未知类型**不报错但信封里没有 `ignorable`**（只有 `type/seq/time/data`），真实读取侧 `validateStoredEvents` 以 `SessionFormatUnsupportedError` **拒绝**重建该会话；而 0.1.5-rc.2 的写侧没有任何入口能设置该标记（`append()` 只透传 `sourceEventSeqs`/`surfaceOp`；`materializeAppendBatch()` 只做 JSON 快照与冻结；`SessionHandle.append()` 是持久化层直写、要求 seq 连续，绕过活动会话日志会让内存日志与存储日志错位，且读取侧仍会拒绝）。→ 路线 A 作废，且**不得写入**（append-only，写进去无法撤销）。
   随后重新追问需求本身：Δ 是**账户级、按回合边界采样**的量（同一账户的并发会话、子代理、别的客户端都会混进来），必须靠"较上一回合（账户级，含其它消耗）"这类文案才不至于被读成"本回合花费"——而那正是本插件明确不做的成本归因。所以连备选的文件持久化路线也不走，直接**移除该位置**（修订 13）。
9. **回合行落点：turnTail → assistant-actions**（该落点已按修订 13 整体移除）
   真机发现"有 `Produced …` 的回合没有用量行"：`conversation.chat.turnTail` 是 chain，单赢家，被平台 deliverables 与 better-sidebar 占用。改为 list 槽 `conversation.chat.assistant-actions`，无抢占；并把挂载点抽成 `src/client/slots.ts` 数据 + 测试守卫（防止再把 turnTail 加回来）。
   **代价（当时需知悉，现已无关）**：动作条由平台控制显隐——最新回合常显，**历史回合 `opacity:0` + 悬停才显示**（平台自己的每回合 token/耗时面板同处）。

10. **`.d.ts` 与兼容性声明**（本文档校正）
    原文写"产出 `.d.ts`"与"声明 `dsh >= 0.1.5-rc.2`"，实现都不成立：`dts: false`，且平台 manifest schema 没有 `compatibility` 字段。已按事实改写。

11. **OpenCode Zen Go：候选 → 实现**（`c01a64f`，0.2.0）
    原决策把它归入"只留契约与文档，不写实现"（理由是"需要浏览器 UA，Cloudflare 保护"）。真机侦察确认只差一个 `user-agent` 就能直连，不需要 OAuth 或任何 CLI 登录文件，凭据模型与既有五家完全一致，于是实现。两条通往同一账户的 DSH 路由（内置 `opencode-go` 与自定义 `opencode-go-deepseek`）按 `sourceId:mode` 去重，只产生一个读数、只发一次请求。
    **代价（需知悉）**：`PROVIDER_HINTS` 的先后顺序成了语义的一部分——`opencode` 必须排在 `deepseek` 之前（否则 `opencode-go-deepseek` 被当成 DeepSeek 账户），而 `sub2api` 必须排在 `opencode` 之前（否则自建网关 `sub2api-opencode` 被当成 OpenCode 账户）。因此 `sub2api-deepseek` 这类同时命中两者的 id 语义随之改变；zai/kimi 被前移到最前，正是为了把这类改变压到最小。
    另：真机上三个窗口读到的都是 `0%`（账户未用），**非零百分比路径与 `status` 非 `ok` 的语义都未验证**。

12. **设置页供应商卡头部：换行 flex → 两列网格**（`dd37b3d`，0.2.3）
    正文（§3）只说了设置页"每行一个供应商"，没规定卡头部怎么排。实现最初用 `ROW`（`flex-wrap: wrap`）+ `justify-content: space-between`，名字块上还带了一对 `overflow:hidden / text-overflow:ellipsis`。
    真机暴露两件事：**其一**，那对省略号是死代码——既没有 `white-space: nowrap`，名字块作为 flex item 又在"先换行、后压缩"的策略下永不被压到溢出，所以一辈子不会触发；**其二**，名字一长整簇控件就被折到第二行左侧：同一页里 `zai-coding-cn` 的按钮贴右、`opencode-go-ds41` 的按钮掉到下一行，对齐随名字长度漂移（用户截图）。
    现决策：头部改为 `display:grid; grid-template-columns: minmax(0,1fr) auto`，名字列 `min-width:0 + overflow:hidden + text-overflow:ellipsis + white-space:nowrap`，控件列 `flex-shrink:0`。**永不换行**，省略号才真正生效；因为 provider id 排在粗体显示名之后，被截断的永远是冗余的那一半，用 `title` 属性兜住全文（不引 `Tooltip`，免得为悬停多包一层 DOM 破坏网格）。共享的 `ROW` 不动：它的 `wrap` 对凭据面板那些行仍然是必要的。
    **代价（需知悉）**：面板很窄时名字列会被压到 `名字 + id` 一起截断。若实测仍嫌紧，下一步是把「自动 / Coding Plan / 隐藏」收成一个菜单、或把 ↑↓ 移进「高级」——那会推翻修订 3 的结论，必须一并改写它。

13. **移除回合行：账户级读数不放在回合上**（`c644e4c`，0.3.0）
    修订 8/9 的方向是"回合行显示该回合的固定值 + Δ"。第 0 步实验先否决了最省事的持久化路线（见修订 8），随后重新追问需求本身，得到的结论是**这个位置本身就不该存在**：余额/额度是**账户级**的，而一个回合是账户级读数无法诚实描述的坐标轴——同一份数字贴在每个历史回合下面，要么与 dock 同源（重复且误导：旧回合下方显示的是当前值），要么被读成"这一回合花了多少"（本插件明确不做的成本归因）。
    现决策：**移除该位置**，状态行只有一个家（当时定的是 `conversation.composer.dock`，后按修订 20 迁到 `conversation.input.dock`）。`src/client/slots.ts` 退化为单一挂载点 + 测试守卫（同时禁止 `conversation.chat.turnTail` 与 `conversation.chat.assistant-actions` 被重新加回），为动作条做的减法（`compactParts`、`ACTIONS_STYLE`、CSS `order: 1`、模型图标替代标签）全部删除。
    **代价（需知悉）**：翻旧回合时不再能看到"当时的读数"。若将来仍想要账户的历史轨迹，诚实的形态是**按时间**而不是按回合（例如 dock 行悬停给出最近几条带本地时间的读数）；那属于本插件"不做历史趋势图/面板"之外的新决定，需要单独讨论并新写一条修订，不能顺手加回。
    **顺带沉淀的平台事实**：外部插件事件在 DSH 0.1.5-rc.2 **不可写**（见 [`platform-notes.md`](platform-notes.md) 第 11 条），这是"回合轨迹跟着会话走"这类需求的硬约束。

14. **分发：发布 npm 包 + 收录进 dsh-market**（`cf1acdf`，0.3.0）
    原决策是"只从 GitHub 安装、不发布 npm"（`private: true`），理由是仓库自带预构建 `lib/`、`dsh plugin add github:` 已经够用。用户随后要求"能被 dsh-market 搜索和安装"，而市场只认精选列表，且卡片上的兼容徽标与下载量都来自 npm，于是改变：
    - **发 npm**（`dsh-usage-state`）：去掉 `private: true`；发布内容是同一份 `lib/`（`files` 白名单：`lib` + `cordis.patch.yml` + README/LICENSE + `docs/adapters.md`，后来又加入 `CHANGELOG.md`）。npm 发布让市场能显示下载量，也让预构建安装免 `allowBuilds` 授权。
    - **兼容声明走 `engines.dsh`**，而不是 `dsh.compatibility`：核对 dsh-market 源码（`discovery-compatibility.ts`）后确认它读的是 **npm latest 清单**里的 `engines.dsh`（或 `dsh.engines.dsh`），其次是同版本线的 `@deepseek-ai/dsh-*` peerDependencies；`dsh.compatibility` / `dshhub` 那类字段市场根本不看。区间显式带上预发布比较符，否则 node-semver 会静默排除 `0.1.5-rc.*` 宿主（contributing.md 专门警告过这一点）。实测**平台自身从不读 `engines`**（grep 过 dsh 的 lib），所以这一项只影响市场，不影响安装。
    - **上架路径**：dsh-market 不搜 npm/GitHub，只在打开时拉 [`awesome-dsh-plugin.com/plugins.json`](https://awesome-dsh-plugin.com/plugins.json)，并拒绝安装列表外的来源；列表由 `awesome-dsh-plugin` 仓库的 `data/plugins/*.yml` 生成 → 收录 = 给对方提一个 YAML 文件的 PR（`data/plugins/takboo__dsh-usage-state.yml`，分类 `usage`），另需仓库打 `dsh-plugin` topic、仓库创建满 1 天。
    **代价与维护义务（需知悉）**：① 市场对 `engines` 判定是**硬**的（peer 的 caret/tilde 上限反而宽容），所以 DSH 出现新发布线时必须复核并放宽这个区间，否则新宿主上会被标成 incompatible（默认只是标注，可选筛选会隐藏）；② 改描述只能改自己那条 yml 再提 PR，**不要**手改对方 README（生成物）；③ 条目会被定期扫描，停更/归档会被移除。

15. **移除 `peerDependencies.react`**（0.3.1）
    起因是端到端安装验证（见 [`release.md`](release.md)）：把 `DSH_HOME` 指到 `/tmp` 后跑 `dsh plugin --profile smoke add dsh-usage-state`，pnpm 报 `✕ missing peer react`。原因是任何 profile 的依赖图里都没有 react——浏览器半边的 react 由平台在**运行时**注入（客户端产物是 CJS 工厂，靠平台模块表拿到 React），根本不走 node_modules；而我们从一开始就在 `peerDependencies` 里声明了 `react: ^18.2.0`（那是 React 库的惯例，不是 DSH 插件的惯例）。
    现决策：**移除该 peer**，`react` 仍留在 `devDependencies` 供构建与类型检查使用。
    **代价（需知悉）**：几乎没有——市场只对 `@deepseek-ai/dsh*` 的 peer 做兼容评估（我们另有 `engines.dsh` 承担版本声明），安装照常成功，只是不再有那行警告；生态里 `dsh-better-sidebar` 等 UI 插件同样不声明 react peer。

16. **放宽 `engines.dsh` 到 0.2 发布线**（0.3.2；**结论后被修订 17 推翻**）
    触发条件是修订 14 写下的维护义务：宿主换到了 **DSH `0.2.0-rc.2`**，而旧区间 `>=0.1.5-rc.1 <0.2.0-0` 的上界 `<0.2.0-0` **按定义排除 0.2.0 的一切预发布**。后果不止徽标：市场源码里 `findCompatibleVersion()` 只挑判定为 `compatible` 的版本，update 路由还会在安装前拒绝"声明不兼容"的版本，所以旧区间会让本插件在新宿主上被判成 incompatible 并**被更新路径挡掉**。
    现决策（当时）：区间改为 **`>=0.1.5-rc.1 <0.3.0-0`**。上界写成 `<0.3.0-0` 而不是 `<0.3.0`，是为了让 0.3.0 的预发布同样被挡住——当时没有任何 0.3 的实测。
    **为什么不是 `^0.1.5-rc.1 || ^0.2.0-rc.1`**：caret 把 `^0.2.0-rc.1` 的上界算成 `0.3.0`（不含预发布比较符），于是 `0.3.0-rc.1` 也会被判为满足。每条边界都不能跨过未实测的预发布线。
    **验证（2026-09-30，宿主 `0.2.0-rc.2`）**：① `tsc --noEmit` 通过；② 259 条单测全绿；③ **同一份源码分别对 0.1.5-rc.2 与 0.2.0-rc.2 的声明构建，`lib/{index,client,typert}.js` 逐字节相同**——当时被视为"两条线共用一份代码"的硬证据；④ 真机启动 0.2.0-rc.2 宿主：插件出现在装配树与 `__DSH_BOOT__` 入口列表，`client.js` 返回 200；⑤ 产物只 `require` 三个外部模块，都在 0.2.0-rc.2 shell 的静态模块表中；⑥ 两个挂载点的契约在两版之间逐字符相同。
    **这次验证为什么没抓住致命问题**：第 ④ 步只验了"入口在列表里、产物可取回"，而 **pending 的入口同样满足这两条**（见修订 17）。教训：兼容复核必须断言"入口**激活**"。

17. **迁到 DSH 0.2 的设置模型：`Config` + `configForms`**（0.4.0）
    修订 16 的结论——"同一份源码对两套声明构建出逐字节相同的 `lib/`，所以两条线共用一份代码"——是**错的**，而且那次验证恰好漏掉了唯一会致命的一环。真机复现（2026-10-05，桌面壳 `0.2.0-rc.2`）：

    ```
    Error: web boot: 1 entry did not activate
    dsh-usage-state: pending (waiting for service: settingsScope)
    ```

    桌面壳把渲染层的启动失败当致命错误：写崩溃报告、弹"启动失败"对话框。用户点了**禁用第三方插件**，`sanitizeProfile()` 把 profile patch 移成 `.bak-<epoch>`、把 `dsh.profile.bundles` 清回模板值——一次服务名失配连带关掉了 profile 里**全部 5 个**第三方插件。

    **根因**：0.2 把客户端设置服务从 `settingsScope` 换成 `configForms`，宿主侧从 `ctx.settings.register(ns, schema)` 换成"插件在自己的 `Config` 里声明 `.volatile()` 字段，settings 服务按 **profile 条目 id** 投影表单、`settings.update/mutate` 落盘"。两套 API **没有一处重叠**。对 121 MB 的 0.2.0-rc.2 `app.asar` 做全量字节扫描：`settingsScope` **0 次**、`configForms` 84 次——不是"能兼容但没实测"，而是**这个服务根本不存在**。

    **为什么修订 16 的验证没抓到**：只验了"入口出现、产物取回 200、外部模块在表里"。**pending 的入口同样满足这三条**。真正的判定在渲染层：web shell 的启动审计对任何非 active 入口直接 `throw`（宿主 CLI 对非必需入口只 warn，桌面渲染层不是）。兼容复核必须落到"入口**真的激活**"。

    现决策：**只支持 0.2 原生路径**，`engines.dsh` 收成 `>=0.2.0-rc.2 <0.3.0-0`，版本跳到 **0.4.0**（0.1 线留在 `0.3.2`）。

    - **宿主**：`src/host/settings.ts` 导出 `Config = z.any().volatile()`；`apply(ctx, config)` 拿到 loader 给的**根引用**，`config.get()` 读出、`ctx.on('loader/volatile-update')` 跟随变更。原 `readNamespace()`（读别的条目，如 `llm-pi-ai` 的 `apiKeyEnv`/`baseURL`）改从 `configEditor.entries()` 取 `entry.fiber.config`，并按 `Symbol.for('cosmokit.volatile.write')` 递归脱引用。
    - **客户端**：`inject` 换成 `configForms`，取 `ctx.configForms.get('usage-state')`；新增 `src/client/settings-form.ts` 适配器，把平台的 form 包成组件一直在用的 settings scope——`normalizeConfig` 在这里解码，快照按底层引用缓存（`useSettingsValue` 只靠引用变化重渲染）。
    - **为什么 `Config` 用 `z.any().volatile()` 而不是逐字段对象**：settings 服务用 schema **投影**表单值，声明式对象 schema 会**静默丢掉**它没声明的每个字段。用真实 schema 实测过：`projectForm` 之后手工文档里的未知键消失，下一次写回就等于删除用户配置。`any` 让投影无损，校验仍由 `normalizeConfig` 一处负责，保持"脏文档也能加载"的原状。
    - **为什么 `volatile` 加在根上**：loader 只在 `schema.meta.volatile` 时把配置变更判为"仅易变"，从而**原地提交**并发出 `loader/volatile-update`；否则每次设置写入都会**重挂载**插件。
    - `cordis.patch.yml` 的插入行补 `config: {}`：否则新装实例没有任何配置节、投影出 `undefined`，状态行会一直沉默到用户第一次保存。

    **代价（需知悉）**：① 0.1.x 用户停在 `0.3.2`，不再收到 0.4.x——市场的 `findCompatibleVersion()` 只挑判定兼容的版本，这正是修订 14 说的硬判定；② `peerDependencies` 新增 `@deepseek-ai/dsh-settings` 与 `@deepseek-ai/schemastery`：前者让**运行时安装闸门**（只读 `@deepseek-ai/dsh*` peer）在 0.1.x 宿主上直接拒绝安装，而不是装上后把人家的启动搞崩；pnpm 可能为缺失 peer 打一行警告，这是预期的；③ 客户端 `devDependencies` 随之上移到 `^0.2.0-rc.2`，类型检查从此对着**受支持的下界**而不是 0.1。

    **验证（2026-10-05，宿主 `0.2.0-rc.2`）**：① `tsc --noEmit` 干净；② 272 条单测全绿，含新增的"平台契约"测试；③ 隔离 `DSH_HOME` + 独立端口，用**打包版 CLI** 装本地包并启动：宿主启动**零激活告警**，`--dump-config` 装配树里是 `- id: usage-state / config: {}`；④ 带 token 取首页解析 `__DSH_BOOT__`：入口在列、`client.js` 返回 200；⑤ **把这份真实产物放进 Node 假模块表跑起来**：`exports.inject = ["slots","locale","configForms","remote","remote.session","remote.credentials"]`，`apply()` 依次注册 effect、`configForms.get('usage-state')`、`remote.$mount(contribution)`，无异常。
    **未覆盖（需知悉）**：没有在真实浏览器里跑 0.2 的渲染与 typert RPC 往返（本机沙箱起不了浏览器）。③④⑤ 证明的是"宿主激活 + 产物可加载 + 服务名齐全 + `apply` 可执行"。

    **流程教训（已写进 [`release.md`](release.md) 的六步复核）**：平台兼容复核必须断言"入口**激活**"，不能只断言"入口在列"。宿主侧的判据是启动 stderr 没有 `did not activate` 告警；客户端侧至少要把**真实产物**放进假模块表跑一遍 `apply`。

18. **0.4.0 的客户端 RPC 契约漏项：codec 必须带 `create()`**（0.4.1）
    0.4.0 把设置 API 迁到 0.2 之后，真机现象是"界面能启动、但**读数全缺**，状态行显示 **Mode not supported**"。这条修订记录第二个偏离，以及为什么上一轮的验证还是没抓住它。

    **根因**：客户端那份手写的 Typert contribution（`remote.$mount()` 交给平台的对象）里的参数 codec 只有 `mode`/`typeSymbol`/`schema`。DSH **0.1.5 只校验 `mode` 与 `typeSymbol`**，所以它在 0.1 线上一直工作；**0.2 的客户端 registry 新增了一条**：

    ```js
    // @deepseek-ai/dsh-typert-registry/lib/client.js
    function validateCodec(codec, subject) {
      if (codec.mode === "src-json") return;
      validateNonempty(`${subject} type symbol`, codec.typeSymbol);
      if (typeof codec.create !== "function") throw new Error(`typert: ${subject} strict codec has no create() factory`);
    }
    ```

    于是 `DescriptorStore.validate` 抛错 → `RemoteStore.register` 抛错 → `$mount()` 的 promise 被拒 → `remote.usageState` 从未安装。宿主半边一直是好的（`src/host/typert.ts` 的 `strictCodec` 本来就带 `create: () => schema`），所以"宿主启动零告警"这种判据天然看不见它。

    **症状为什么会长成"Mode not supported"**：客户端 store 的 catalog 与读数在同一条 RPC 回答里，RPC 从未成功 ⇒ `state.catalog` 为空 ⇒ `resolveProvider` 返回 `unknown-source`（`sourceId` 非空，来自静态建议）⇒ `StatusLine` 把 `unknown-source` 和 `unsupported` 归成一类，于是显示"模式不支持"。**这条映射本身也是缺陷**：把"我还没听到自己宿主的回答"说成"这个数据源不支持该模式"，正是在误导读者去查一个不存在的配置问题。而插件又把 `$mount` 的 rejection **静默吞掉**，所以浏览器控制台、宿主日志里都没有任何线索。

    现决策（0.4.1）：
    - `src/client/contribution.ts`（从 `index.tsx` 抽出的独立模块）给 strict codec 补上 `create(): { parse }`，浏览器产物依旧**不引入 zod**（`create` 返回手写校验器；宿主侧那份用 zod）。
    - **不再静默**：mount 失败时 `console.error` 并把消息写进 store（`failRemote`），状态行与设置页因而能说出真正的原因。
    - **改正误报**：`ModelStatus` 增加 `loading`；catalog 为空时不再声称 `unsupported`，而是"读取中"；若 store 处于 `error` 且 catalog 为空，状态行直接显示失败原因（`errorDetail` 进 tooltip，设置页正文打印）。`sourceId === null`（压根推断不出数据源）仍按"未配置"处理。
    - **回归守护（两条，都是"跑真实契约"而不是"跑我们的理解"）**：`tests/client/contribution.test.ts` 把 contribution 注册进**真实 0.2 registry**（经 `window.__ModuleLoader__` 信封加载平台产物）并要求两个 endpoint 都能解析；`tests/build/bundle.test.ts` 对**构建产物 `lib/client.js`** 做同一件事。共享 harness 在 `tests/support/browser-face.mjs`。

    **验证（2026-10-05，宿主 `0.2.0-rc.2`，全部实跑）**：① 对照实验——同一份 contribution，去掉 `create` 被真实 registry 拒绝，补上后接受且 endpoint 可解析；② `tsc` 干净、278 条单测全绿；③ 从**真机宿主**取回它实际发出的 `client.js`，放进假模块表 + 真实 registry：`apply()` 完成、无 `console.error`；④ `npm pack` 出的 0.4.1 tarball 装进全新 profile 启动**零激活告警**。

    **流程教训（已写进 [`release.md`](release.md) 六步复核的第 7 步）**：迁平台契约时，"入口激活"只覆盖了 **cordis 服务注入**；**RPC contribution 的挂载**是另一条独立契约，必须拿**真实 registry** 校验，而且**任何被静默吞掉的 rejection 都是不可接受的**——它把一个确定性失败变成一次长时间的猜测。
    **代价（需知悉）**：状态行多了一个 `loading` 态；"真的不支持该模式"只会在客户端确实拿到了数据源目录时才出现。

19. **0.2 的 composer dock 变成"共享一排 pill"，状态行改成其中的一项**（0.4.1；该形态随后被修订 20 取代）
    读数恢复之后，真机看到的是：我们那一行被塞进平台自己的统计行里——`1 turns 1 st…`、`7.8K tok…`、我们的 `5h/7d/30d`、平台的 `◐ 1%` 挤成一排，数据源名被截成 `en Go`。

    **根因（平台侧，0.1.5 → 0.2 的布局语义变了）**：
    - 0.2 的 `conversation.composer.dock` 是 **`display:flex; justify-content:center; align-items:center; gap:12px`**（`InputBar_module_css`），子节点是 `[renderSlot("conversation.composer.dock"), ContextMeter]`；
    - 平台自己往这个槽位注册的是 **`StatsPills`（`id: "stats"`, `order: 0`）**，其样式是 `.pill{display:inline-flex;max-width:100%;…;border-radius:999px;…;white-space:nowrap}`；
    - 也就是说这个槽位在 0.2 是**一排居中的小 pill**，而不是"统计行下方的一整行"。我们的 `DOCK_STYLE` 仍按 0.1 的假设写了 `width:100% + max-width:var(--dsh-chat-content-width) + margin:0 auto + 大内边距`。

    **症状机制（值得记住）**：`width:100%` 让它在这一排里吃掉几乎全部宽度，把兄弟压到 min-content（平台那两个 pill 因此显示成 `st…`/`tok…`）；而它自身又 `justify-content:center` + `overflow:hidden`，被压缩后内容居中溢出 → **首尾同时被裁**，于是 `OpenCode Zen Go` 只剩尾巴那段 `en Go`。这不是"信息太多"，是 flex 语义用错。

    当时决策（0.4.1）：`DOCK_STYLE` 与平台 `.pill` 同构、`justify-content:flex-start`、`font:inherit`，并加几何回归测试。
    （0.4.2 起按修订 20 迁走，这里的 pill 几何不再生效；但**症状机制**与槽位侦察结论仍然有效。）

20. **状态行迁到 `conversation.input.dock`：0.2 里唯一能"独占一行"的位置**（0.4.2）
    修订 19 把状态行改成了与平台统计共排的 pill，但用户的诉求是"像原来那样单独一行"。于是把 0.2 的槽位与渲染位置完整侦察了一遍，结论如下（都已核对产物，不是猜的）：

    **0.2 的组合器结构**（`dsh-client-ui-conversation/lib/client.js`）：
    ```
    .scrollBody > [ Views(会话内容), composerSeat(composer) ]        ← composer 是最后一个元素
    composerSeat > .composerStack                                    ← column flex，gap 6px，无 align-items
      .composerStack > [ hero…, renderSlot("conversation.input.dock", zone), inputBar ]
      inputBar      > [ (notice), .card(输入卡片：.row…), .dock(composer.dock + ContextMeter) ]
    ```
    - `composer` 之后**没有任何槽位**——"输入框之下"要么是 `.dock`（修订 19：与平台 `StatsPills`、`ContextMeter` 共排的一行 pill，nowrap），要么不存在；
    - `.dock` 是 `display:flex; justify-content:center; gap:12px` 且**没有 `flex-wrap`**，所以那一排里任何"自己一行"的尝试都只能靠挤压兄弟实现；
    - `conversation.input.dock` 是 **`{kind:"list", scope:"session"}`** 正式声明的槽位（平台的排队消息 dock 就注册在 `id:"queue", order:20`），渲染在**输入卡片之上**，且 `.composerStack` 是 column flex → 贡献默认被 stretch 成**整行宽**；平台自己的 queue dock 用的就是 `width:100%; max-width:var(--dsh-composer-card-max-width)`。
    - 同时确认的其它槽位（供后来者省一次侦察）：`conversation.composer.bar`（其 children 为 `input.{attachments,overlay,permission,left,plan,right,model,activity}` + `composer.dock`）、`conversation.{view,content,header,session,session.header,session.header.*}`、`conversation.chat.{node,turnTail,assistant-actions,commandview}`、`main.conversation`、`shell.{leading,overlay}`、`sidebar`、`rightbar`、`settings.general.item`。没有 `conversation.footer` / `composer.stats` 这类槽位。

    现决策：状态行改挂 **`conversation.input.dock`**（`id: usage-state`, `order: 200`，排在排队消息之后），样式改成整行块：`width:100%` + `max-width:var(--dsh-composer-card-max-width)` + `margin:0 auto` + `padding:0 var(--dsh-composer-side-clearance)`，`justify-content:center`，并加 **`flex-wrap:wrap`**（窄窗口下在**段与段之间**换行，而不是裁切或挤压平台布局）。

    **代价（需知悉）**：① **位置从"输入框之下"变成"输入框之上"**——0.2 里输入框之下不存在整行位置，这是"独占一行"的唯一代价；② 读数很长时（标签 + 三个窗口）会折成两行，这是有意的取舍（比裁切诚实）；③ 该槽位的 `zone` 门控是 `session && inputState`，正常会话里恒成立，但**全新空会话/hero 态**可能不渲染，此时不显示。
    **验证**：`tests/client/slots.test.ts` 断言挂载点唯一且 `order > 20`；`tests/client/render.test.ts` 断言 `width:100%` + 卡片宽度上限 + `margin:0 auto` + `flex-wrap:wrap`，且不再出现 pill 几何（`border-radius:999px`）与 `overflow:hidden`。

21. **迷你进度条的字形回落会吃宽度；分隔符必须与段落同盒**（0.4.3；进度条本身随即被修订 23 的圆环取代）
    0.4.2 把状态行放回"输入框上方独占一行"后，真机（1512px 宽窗口）看到的是**折成两行**、且折行处留下一个孤立的 `·`。

    两个原因，都是渲染层面的：
    - **`█`(U+2588) / `░`(U+2591) 不在 shell UI 字体的覆盖范围内**，于是被**回落字体**接管，而回落字体把它们排成约**两倍**的推进宽度：8 格的条实测约 180px，三条就是 ~540px。这是"我们以为只有 8 个字符"的典型误判——**字符数≠宽度**，尤其是块/阴影类符号。
    - **分隔符原本是段落的兄弟节点**（`Fragment` 里 `[separator?, part]`），所以折行可以停在 `·` 之后、把段落甩到下一行。

    现决策（留存有效的部分）：
    - 每个段落与**它前面的分隔符**包进同一个 `inline-flex` 盒子（`data-usage-part`），折行只发生在盒子之间，结构上不可能再出现孤立分隔符；
    - 回归测试断言"每个后续分组的开头都有 `·`、第一个分组没有"。
    **通用教训**：字号/字体不确定时，不要用块状 Unicode 画条——要么指定字体，要么用 CSS/SVG 画。

22. **排版要"照抄参照物的显式声明"，不能靠 `inherit`**（0.4.3）
    0.4.3 修好折行后，真机看到我们的行**比输入框下方那排统计明显大一号**。原因不是我们写了什么，而是我们**没写**：

    - 我们的元素挂在 `.composerStack` 下（`conversation.input.dock`），于是 `font: inherit` 继承到的是**输入卡片区的 `--dsh-content-font-size`（14px）**；
    - 平台那排统计（`StatsPills.module.css` 的 `.root`）虽然让 `.pill` 用 `font: inherit`，但 `.root` **自己显式声明**了
      `font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px)` 与
      `line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px))`。

    也就是说：`inherit` 只有在**继承链相同**时才等价。`.dock` 在 `.root`（输入条容器）内部，而我们的槽位是输入条的**兄弟**——两条链的字体上下文不同，凭"看起来都在输入框附近"推断就会错。

    现决策：**照抄平台那两行表达式**（连同 fallback 一起），而不是猜一个 px 值：无论 shell 的变量实际解析成多少，两侧都按定义相等；**不设置 `font-family`**，好让 UI 字体插件照常生效。新增测试断言这两条表达式存在、且**不出现** `font:inherit`。

    **代价（需知悉）**：平台若调整它自己那排的字号，我们不会自动跟随（测试把这两个表达式钉成了契约，改平台时要同步改这里）；`severity` 变色（warn/critical）是为功能服务的**有意差异**，不追求与平台逐像素相同。

23. **进度条改成平台同款圆环（SVG）**（0.4.3）
    用户反馈"平台的圆圈进度比我们的文字条更好更简洁"。这不只是好看：文字条本身就是麻烦的来源——它依赖 `█`/`░` 的字形覆盖（回落字体把它们排成两倍宽，修订 21），修法只是把宽度从"不可控"变成"可控但还得维护字体栈"。**改成 SVG 之后这类问题整类消失**：矢量图形没有字形度量。

    实现取自平台自己的 `ContextMeter`（`conversation` 包）：
    - 几何：`viewBox="0 0 14 14"`、`r = 5.5`、`stroke-width: 2`、`stroke-linecap: round`、`transform="rotate(-90 7 7)"`（弧从 12 点开始）、`strokeDasharray = [周长 × percent/100, 周长]`；
    - 配色：轨道 `stroke: var(--dsw-alias-border-l3)`（照抄平台的 `.track`）；进度弧用 **`stroke: currentColor`**，于是段落的 `severity` 颜色（normal/warn/critical）自动传导到环上——这是与平台 `.fill{stroke:label-tertiary}` 的**有意差异**（我们要保留阈值变色）；
    - 位置：环在文字**之前**（`◐ 1%` 的排法：图标在前），14px 与平台那一排的图标同尺寸。

    数据模型也跟着改了：`StatusSegment.bar?: string`（画好的 8 字字符串）→ `progress?: number`（0..100 的数值），`progressBar()` 文本函数与 `PROGRESS_WIDTH` 一并删除——不再有"谁来画条"的字面量。`display.progressBar` 配置键**保留**（改名会破坏既有配置），仍可关闭环。

## 附录：初版实现顺序（历史，已全部执行完毕）

> 2026-09-20 grilling 定下的顺序，留作"共识如何变成现实"的对照。实际执行中的偏差见上方修订。

1. 脚手架 + 设置命名空间 + 自定义设置页（模型清单 / 三态 / 排序 / 密钥状态与写入）。
2. 宿主 adapter 框架 + DeepSeek 余额 + RPC 快照通道。
3. 客户端状态行 + 中英词典。（原计划的"回合动作条"位置后按修订 13 移除。）
4. z.ai / Kimi / sub2api 适配器 + 解析单测。
5. 本地装入与验收 → 卸载 cost-meter → GitHub 发布。
