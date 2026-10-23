# 数据源适配器

当前支持DeepSeek、z.ai、Kimi/Moonshot、OpenCode和Sub2API。用户排查见 [指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/troubleshooting.md)，代码入口见 [架构](https://github.com/takboo/dsh-usage-state/blob/main/docs/architecture.md)，未验证项见 [待办](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md)。本文随npm分发。

## HTTP来源契约

[UsageSource](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/types.ts) 定义id、modes、credentialRefs、defaultBaseUrl、request、可选fallbackRequests及parse。request纯构造url/headers，parse纯解析；网络由 [read.ts](https://github.com/takboo/dsh-usage-state/blob/main/src/host/read.ts) 执行，单请求默认15秒超时。

HTTP401/403归auth；JSON语法错归parse，响应体超时/中断归network。仅未固定端点时按Adapter声明尝试镜像。无有效金额/窗口抛SourceError，不以伪造零覆盖成功值。金额必须根据官方字段主单位解析，百分比与计数按明确口径转换。

`requiresApiKey`字段本身不会增加免密钥读取能力。HTTP来源仍需完成凭据解析；DeepSeek账号模式使用下面单独的宿主服务通道。

## 字段语义

| 来源/模式 | 请求与鉴权 | 归一化语义 |
|---|---|---|
| DeepSeek账号 | `deepseekAccount.getBalance(client)`；不构造HTTP、不读取API Key | `value`为充值钱包，`bonusWallets`为赠送钱包；同币种求和，保留toppedUp/granted，优先有余额/CNY |
| DeepSeek API Key | GET `{base}/user/balance`，Bearer | 多币种balance_infos；优先有余额/CNY，保留赠送/充值拆分；非法total跳过，无有效行报parse |
| z.ai Coding Plan | `/api/monitor/usage/quota/limit`，Key | 国内/国际端点与错误信封；保留5h/7d已用百分比，跳过无效窗口 |
| Kimi Code | GET `https://api.kimi.com/coding/v1/usages`，Bearer；区域镜像 | usages比例池或旧usage/limits计数；支持5h/7d/月总/编程月；仅显示实际返回窗口 |
| Moonshot | GET `{base}/v1/users/me/balance`，Bearer | available_balance单位为人民币元，不按数值大小推测分/元 |
| OpenCode Zen Go | GET `{base}/zen/go/usage`，Bearer及浏览器UA | rolling/weekly/monthly归一为5h/7d/30d；percent已是0–100 |
| Sub2API | GET `{base}/v1/usage`，Bearer；需实例地址 | Key配额/余额与实例实际返回的订阅窗口；不把无限值当可用金额 |

厂商语义优先依 [DeepSeek官方余额接口](https://api-docs.deepseek.com/api/get-user-balance) 与 [Moonshot官方余额定义](https://platform.kimi.com/docs/api/balance.md)。Kimi契约与兼容样本见 [实现](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/kimi.ts) 和 [源测试](https://github.com/takboo/dsh-usage-state/blob/main/tests/sources/kimi.test.ts)。社区接口与历史逆向证据在 [归档](https://github.com/takboo/dsh-usage-state/blob/main/docs/archive/README.md)，使用前重新核验。

## DeepSeek Harness 账号与 API Key

自动识别 `deepseek-account → deepseek:account`，`deepseek-official → deepseek:api`。账号模式忽略API Key ref与余额端点覆盖，无服务或无登录时不回退。Host通过 `getPlatformSession()` 的issuer/token摘要隔离身份，原始token不进入通用Key字段、RPC、配置或错误详情；读取前后复核身份，签出事件清缓存。

账号服务负责目的地址、登录协议、超时和grant失效。client元数据使用Host包版本、Host locale与时区；无可解析版本时留空。`getBalance()` 返回安全投影：`status: ready`、充值钱包数组value、赠送钱包数组bonusWallets；每行含CNY/USD及主单位balance。金额/数组非法报parse，真实零保留；同币种充值与赠送合计为显示余额。

`status: failed`保守归http，因为Host已折叠底层失败；插件无法再细分网络与协议错误。null表示登录不可用。失败只保留同一登录身份的上次成功值；身份改变后清除。契约核对来源为2026-10-23安装的Desktop包 `dsh-deepseek-account-platform` 和 `dsh-llm-deepseek-account`，以及 [官方账号服务文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/deepseek-account-platform/README.md)。真实账户验收范围见待办，不由契约核对代替。

## 增加或修改来源

1. 核对官方接口、鉴权、单位和错误形状；未文档化契约标明来源、日期及不确定性，fixture去除账户信息。
2. 在 [sources](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/index.ts) 注册，使用 [模板](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/_template.ts)；模式必须是来源确实支持的读数。
3. 如需自动发现，更新共享provider/source规则并测命名冲突；新模式同步线上类型、Host codec、两UI及目录。
4. 覆盖实际装配链、非法字段/真实0、身份切换与失败；保证凭据描述和读取采用同一有效选择。
5. 按 [开发流程](https://github.com/takboo/dsh-usage-state/blob/main/docs/development.md) 完成typecheck、build、test、pack；更新双语README、当前文档与Changelog，未做的真实验收留在待办。
