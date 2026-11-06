# 平台契约与兼容边界

当前支持范围以 [engines及peer](../package.json) 为准。默认测试依赖锁定0.2.0基线，CI读取 [精确回归候选](../.github/dsh-compatibility.json) 并使用对应真实Typert loader/registry；这证明协议契约，不等于每次改动都重新做完整宿主安装。0.4.7/0.4.8的隔离安装与浏览器证据见 [历史兼容性记录](archive/platform-compatibility-2026-10-17.md#dsh-021-compatibility)。

## RPC与浏览器装配

- Host清单导出named `TYPERT`并通过package的 `./typert` 暴露；strict codec使用真实zod v4 schema，zod是运行依赖。
- `typertRemote.service`是服务对象，serviceKey为注册名，namespace与线上命名空间一致；否则gateway拒绝绑定。
- 0.2客户端非src-json codec需要 `create()` 工厂；可选force参数仍显式传值或undefined并声明acceptsUndefined。
- 自己贡献的remote命名空间通过 `ctx.get` 读取，挂载失败展示错误。Client运行时只使用模块表公开的共享依赖，不导入Harness Client包；服务声明使用类型导入，按钮、输入框、开关及Tooltip由插件实现并复用宿主主题token。

从0.4.11起，插件导出 `./locale/en.json` 与 `./locale/zh.json`，以官方 `meta.title` / `meta.description` 提供中英文显示名和说明，技术包名与设置标识不变。当前工作树另通过 `./icon` 导出原创SVG，纳入发布白名单，metadata及实际tarball检查覆盖导出、文件、格式包络与256 KiB上限。旧宿主若未实现展示元数据能力，可以回退显示包名；自动兼容性检查允许此回退，双语展示的专门复验另行强制断言本地化元数据。

契约由 [Host测试](../tests/host/typert.test.ts)、[客户端贡献](../tests/client/contribution.test.ts) 和 [bundle测试](../tests/build/bundle.test.ts) 检查。SSR桩件检查标记，React交互检查回调与effects，实际布局仍需浏览器验收。

## 凭据服务

每次resolve/describe获取当前 `credentials` 服务；启动顺序或重载不能永久缓存“无服务”。宿主回答优先：历史0.2.0偏环境，0.2.1 Web/Desktop偏已保存凭据。插件仅在宿主无结果时保留env→file的直接回退，并标记direct来源。写权限由宿主描述决定。

OpenAI Admin 模式仅使用 provider 手动填写的 `adminKeyRef`，不发现默认 Admin 名称，不继承普通 `apiKeyRef`、source 默认或推理服务环境引用。resolve/describe 均只处理这个显式名称；宿主无结果时的直接回退也仅限同一显式名称。只有精确 `writable === true` 才允许写入。

0.4.9账号路径动态读取 `deepseekAccount`，要求 `getPlatformSession()` 与 `getBalance(client)`。账号服务负责协议、超时、目的地址和登录失效，插件只取Host内身份摘要和安全钱包投影。精确契约及验证边界见 [适配器指南](adapters.md#deepseek-harness-账号与-api-key)。旧宿主缺少此服务时不启用API Key替代。

<a id="module-resolution"></a>

## 依赖解析与安装

共享平台实例按peer+dev声明，独立第三方依赖按runtime声明。link是否能回落到平台依赖取决于宿主版本和安装位置；当前工作树有开发依赖，link成功不能证明tarball可安装。schema真实下界为3.18.3，预构建冒烟可指定该版本，不注入volatile polyfill。

<a id="client-hmr"></a>

## 配置、槽位和热替换

Config 由 loader 提供 volatile 根；ConfigForm 写入的 Promise<boolean> 返回 false 意味着拒绝。继续使用 `configForms.get('usage-state')`，不增加并行写入通道。插件内配置使用 `plugins.row.config`，精确 entry key 为 `dsh-usage-state#usage-state`（不是 bundle row `usage-state`）；`view: 'summary'` 返回行内摘要，`view: 'page'` 由宿主提供标题与导航。

`ConfigPageForm` 只有 `state` 快照与 `mutate(ops, revision)`，不提供宿主 Save 控制器。页面自行管理草稿并提交窄路径操作，首次编辑固定 revision；dirty 时不因新快照自动 rebase，失败／冲突保留草稿，Reset 采用最新快照，卸载丢弃。凭据独立即时保存，不参与配置撤销。当前契约已在 Desktop 0.2.1-rc.5 Inspect 与安装包核对，不把旧版自动 RPC 检查视为插件内配置页面的视觉验收。

状态行唯一槽位仍为 `conversation.input.dock`，不是原生统计共排的 composer.dock。注册位置见 [slots](../src/client/slots.ts)，平台升级需复核公开槽位及实际布局。

patch及Host代码在启动时读取。client-hmr只在活跃传输与实际产物重建时生效；watch覆盖Host和client不代表Host自动热替换。

## 重新核验

版本自动发现与快速契约检查见 [DSH版本监测](compatibility-monitor.md)；通过不等于完整宿主验收。

新宿主发布线先验证实际tarball安装、Host激活、浏览器装配、RPC及当前功能，再放宽支持声明。历史0.1 codec、会话事件和本机探针只在 [归档](archive/README.md) 保留；本插件不写会话日志是产品决定，不依赖对所有平台版本的能力断言。

## 验证记录

当前精确契约候选由 [CI清单](../.github/dsh-compatibility.json) 维护；逐版本自动检查的固定提交、integrity和阶段结果保存在 `docs/compatibility/`，[0.2.2-alpha.3](compatibility/0.2.2-alpha.3.md) 与 [0.2.2-rc.1](compatibility/0.2.2-rc.1.md) 证据不扩大支持声明。

DSH 0.2.1-rc.3 的独立安装、动态模型目录、文件凭据及浏览器过程保存在 [0.4.10发布记录](releases/0.4.10.md#宿主浏览器验收与边界)；rc.5 的隔离Web与双语metadata断言、截图保存在 [0.4.11发布记录](releases/0.4.11.md#候选验证)。各版本分发及同包运行验证从 [发布流程](release.md) 进入，未完成的真实验收统一见 [Backlog](backlog.md)。
