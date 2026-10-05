# 平台事实（从真机调试学到的，下次直接复用）

> 这些是**对 DSH 平台行为的实测结论**，不是本插件的设计决策。设计决策见 [`design-consensus.md`](design-consensus.md)，其演变史见 [`design-changelog.md`](design-changelog.md)。
> 每条都有真机或产物级实验背书；引用前注意条目里标注的**平台版本**——平台升级后应复核仍在生效的条目。

1. **`typertRemote.service` 必须是服务对象本身**（`Reflect.get(value,'service') !== original` 会导致每次派发 `gateway/binding-invalid`）；`serviceKey` 才是名字。症状是"插件静默返回空"。
2. **宿主 codec 必须是 zod v4**（loader 检查 `'_zod' in schema`），因此 `zod` 是运行时依赖。
3. **RPC 参数个数是精确匹配**：可选参数也必须显式传（配合 `acceptsUndefined: true`）。
4. **`ctx.remote.<ns>` 属性访问需要 inject**；读自己贡献的命名空间必须用 `ctx.get('remote.<ns>')`（否则 `cannot get property … without inject`）。
5. **`@deepseek-ai/*` 能不能解析，取决于插件是「装进 profile」还是「link 挂载」**（2026-10-05 校准；原文只写了后半句）：
   - **pnpm 装进 profile 的插件**（npm / 市场 / `dsh plugin add <tarball>`）：loader 给它们平台的模块回落，`import z from '@deepseek-ai/schemastery'` 正常工作——用探针插件在全新 `DSH_HOME` 上实测（`PROBE-RESULT: schemastery import OK`）。`dshmarket`、`@mzzsfy/dsh-turn-notify` 等第三方插件正是靠这条活着；我们的宿主半边从 0.4.0 起也依赖它。
   - **`link:` 挂载在 profile 之外的插件**：**没有**这层回落，只按 Node 常规从自己所在目录向上找，所以 `@deepseek-ai/*` 报 `ERR_MODULE_NOT_FOUND`（同探针 link 挂载实测：`dsh: warning: 1 entry did not activate / probe-schemastery: failed to import`）。
   - **这构成一个验证陷阱**：本仓库**自己有** `node_modules/@deepseek-ai/schemastery`，所以用 `dsh plugin add "$PWD"`（link）做冒烟会**假绿**——解析成功靠的是仓库的 devDependencies，不是平台回落。冒烟必须走 `npm pack` + 安装 tarball（[`release.md`](release.md) 第 2 步已据此改写）。
   - 其余宿主代码仍一律使用结构化类型：平台包只 import 这一处。
6. **bundle patch（含插件自己的 `cordis.patch.yml`）只在启动时读取**；客户端 bundle 会被 `dsh-client-hmr` 热替换（`tsdown --watch` 足够，无需 `pnpm run dev:web`）。
7. **Node 的类型剥离不支持 `.tsx`/构造器参数属性/枚举**：`src` 避开这些写法，`.tsx` 由测试钩子用项目自带 TypeScript 转译。
8. **浏览器包不能在 Node 里 import**（CSS 模块 + 未声明的传递依赖）→ 渲染测试用模块钩子替换 primitives 桩件。
9. **z.ai 用 HTTP 200 + `{success:false,code:1000,msg}` 表达鉴权失败**；区域站点互不认对方的 key。
10. **客户端 Typert contribution 的 strict codec 必须带 `create()`（0.2 起）**：`@deepseek-ai/dsh-typert-registry/client` 的 `validateCodec` 对非 `src-json` 的 codec 要求 `typeof codec.create === 'function'`，而 0.1.5 只校验 `mode` 与 `typeSymbol`。缺了它 `remote.$mount()` 的 promise 直接被拒，`remote.<namespace>` 服务不会安装——**症状是读数全缺，而不是启动失败**（0.4.0 踩过，见修订 18）。协议里解码走 `codec.create().parse(value)`；宿主清单的同一要求由 `@deepseek-ai/dsh-typert-loader` 把关。
11. **外部插件事件在 0.1.5-rc.2 是"设计上可读、实际上不可写"**：会话日志的读取侧**支持**未知类型——只要事件带 `SessionEvent.ignorable: true` 就安全跳过（`KNOWN_SESSION_EVENT_TYPES` 的注释明确说仓库外插件事件"by construction"不在名单里，该标记就是兼容机制）。但**写侧没有任何入口能设置它**：`Session.append(type, data, opts)` 只透传 `sourceEventSeqs` / `surfaceOp`，构造出的信封只有 `type/seq/time/data`；`materializeAppendBatch()` 只做 JSON 快照与冻结；`SessionHandle.append()` 是持久化层直写（要求 seq 连续），绕过活动会话日志会让内存日志与存储日志错位，且读取侧照样拒绝。
    **实测（离线，2026-09-21，`dsh-session` + `dsh-session-persistence` 均 `0.1.5-rc.2`）**：`Session.append('usage-state/turn-usage', …)` 写入成功但信封无 `ignorable` → `validateStoredEvents(meta, [event])` 抛 `SessionFormatUnsupportedError`（*"contains event type … unknown to this harness and not marked ignorable; refusing to interpret the log"*）；手工补 `ignorable: true` 后校验通过（证明标记有效、只缺写入口）；对照组 `command/run` 正常通过。
    **结论**：插件**不得**往会话日志追加自有类型事件——日志是 append-only，写进去无法撤销，且会让别人的读取器拒绝重建整个会话。任何"数据跟着会话生命周期走/随会话迁移"的需求，在当前平台版本都没有合法落点。平台也明确否决过"事件名注册"方案。**若将来版本给 `append` 加上该标记（或提供注册通道），这条才需要重写。**
    复现（用平台自己的包，无需启动 DSH；`@deepseek-ai/dsh-session` 与 `-persistence` 未列为本仓库依赖，需从 DSH 安装目录借 `node_modules`）：

    ```js
    const { Session, SessionId } = await import('@deepseek-ai/dsh-session')
    const { validateStoredEvents } = await import('@deepseek-ai/dsh-session-persistence')
    const session = Session.create(SessionId('probe'), [], undefined, 0)
    const event = session.append('usage-state/turn-usage', { probe: true })
    Object.keys(event)                    // ['type','seq','time','data'] —— 没有 ignorable
    validateStoredEvents(session.header, [event])  // throws SessionFormatUnsupportedError
    validateStoredEvents(session.header, [{ ...event, ignorable: true }])  // 通过
    ```
12. **回合级插槽都不适合承载常显的行**：`conversation.chat.turnTail` 是 chain（单赢家，`dsh-client-ui-deliverables` 与 `dsh-better-sidebar` 都注册在此），任何产出文件的回合都会把它们之一选为赢家，其他条目**不会被询问**，`select` 又被契约要求是纯函数、无法让路；`conversation.chat.assistant-actions` 是 list 槽（无抢占），但由平台渲染在**回合动作条**内，而该条在**非最新回合是 `opacity: 0` + `:hover` 才显示**（平台自己的每回合 token/耗时面板也在那里；`MessageIconActions.extraActions` 的位置由平台固定——类型注释原文 *"placed between the built-in copy and branch controls"*，且整条只有 28px 高）。
    这条事实与"要不要在回合上展示账户读数"是两件事：后者已按修订 13 **否决**（账户级读数不属于回合），因此本插件现在只挂 `conversation.input.dock`；上面这些平台行为记录下来，是为了下次有人想在回合动作条里放东西时不必重新踩一遍。
