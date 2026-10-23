# 平台契约与兼容边界

当前支持范围以 [engines及peer](../package.json) 为准。默认测试依赖锁定0.2.0基线，CI另用精确0.2.1-rc.1/rc.2的真实Typert loader/registry；这证明协议契约，不等于每次改动都重新做完整宿主安装。0.4.7/0.4.8的隔离安装与浏览器证据见 [历史兼容性记录](archive/platform-compatibility-2026-10-17.md#dsh-021-compatibility)。

## RPC与浏览器装配

- Host清单导出named `TYPERT`并通过package的 `./typert` 暴露；strict codec使用真实zod v4 schema，zod是运行依赖。
- `typertRemote.service`是服务对象，serviceKey为注册名，namespace与线上命名空间一致；否则gateway拒绝绑定。
- 0.2客户端非src-json codec需要 `create()` 工厂；可选force参数仍显式传值或undefined并声明acceptsUndefined。
- 自己贡献的remote命名空间通过 `ctx.get` 读取，挂载失败展示错误。客户端依赖由shell模块表提供，浏览器UI包的CSS入口不直接在Node运行。

契约由 [Host测试](../tests/host/typert.test.ts)、[客户端贡献](../tests/client/contribution.test.ts) 和 [bundle测试](../tests/build/bundle.test.ts) 检查。SSR桩件检查标记，React交互检查回调与effects，实际布局仍需浏览器验收。

## 凭据服务

每次resolve/describe获取当前 `credentials` 服务；启动顺序或重载不能永久缓存“无服务”。宿主回答优先：历史0.2.0偏环境，0.2.1 Web/Desktop偏已保存凭据。插件仅在宿主无结果时保留env→file的直接回退，并标记direct来源。写权限由宿主描述决定。

0.4.9账号路径动态读取 `deepseekAccount`，要求 `getPlatformSession()` 与 `getBalance(client)`。账号服务负责协议、超时、目的地址和登录失效，插件只取Host内身份摘要和安全钱包投影。精确契约及验证边界见 [适配器指南](adapters.md#deepseek-harness-账号与-api-key)。旧宿主缺少此服务时不启用API Key替代。

<a id="module-resolution"></a>

## 依赖解析与安装

共享平台实例按peer+dev声明，独立第三方依赖按runtime声明。link是否能回落到平台依赖取决于宿主版本和安装位置；当前工作树有开发依赖，link成功不能证明tarball可安装。schema真实下界为3.18.3，预构建冒烟可指定该版本，不注入volatile polyfill。

<a id="client-hmr"></a>

## 配置、槽位和热替换

Config由loader提供volatile根；ConfigForm写入的Promise<boolean>返回false意味着拒绝。配置与凭据权限独立。

唯一槽位为 `conversation.input.dock`，不是原生统计共排的composer.dock。注册位置见 [slots](../src/client/slots.ts)，平台升级需复核公开槽位及实际布局。

patch及Host代码在启动时读取。client-hmr只在活跃传输与实际产物重建时生效；watch覆盖Host和client不代表Host自动热替换。

## 重新核验

新宿主发布线先验证实际tarball安装、Host激活、浏览器装配、RPC及当前功能，再放宽支持声明。历史0.1 codec、会话事件和本机探针只在 [归档](archive/README.md) 保留；本插件不写会话日志是产品决定，不依赖对所有平台版本的能力断言。
