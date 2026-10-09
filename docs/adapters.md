# 适配器指南

适用于扩展或调整余额/额度来源。当前代码支持DeepSeek、z.ai、Kimi、OpenCode和Sub2API。用户安装排查请读 [排查指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/troubleshooting.md)，候选和整改状态见 [Backlog](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md)。本文件随npm包发布，代码和其他文档链接指向GitHub。下文描述当前Unreleased工作树，npm已发布0.4.4不包含本轮修复。

## Interface

完整定义以 [sources/types](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/types.ts) 为准。下列是主要字段：

```ts
interface UsageSource {
  id: string
  displayName: string
  modes: readonly UsageMode[]
  credentialRefs(mode: UsageMode): readonly string[]
  defaultBaseUrl(mode: UsageMode): string | undefined
  requiresBaseUrl?: boolean
  requiresApiKey?: boolean
  request(input: RequestInput): UsageRequest
  fallbackRequests?(input: RequestInput): readonly UsageRequest[]
  parse(payload: unknown, mode: UsageMode): UsageReading
}
```

request纯构造url和headers；parse只处理payload，不访问网络、凭据或当前时钟。RequestInput提供mode/apiKey及可选baseUrl/pinnedBaseUrl；读取Module负责执行、15s单次超时、HTTP错误分类和按序镜像。模板见 [新源骨架](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/_template.ts)。

requiresApiKey在类型中存在，但当前宿主装配仍要求解析到凭据。不能只设置false就宣称已支持无key数据源；若要支持需补完整链路测试。

## 增加数据源

1. 用官方文档或固定commit接口定义查清端点、鉴权、单位、百分比口径、重置时刻及错误信封；没有官方资料时明确标社区观察/未验证。fixture去除key和账户信息。
2. 新建Adapter和源测试，覆盖正常余额/窗口、真实0、非法/缺失字段、数字串、不同时间形态，以及HTTP200错误信封。无有效读数应抛SourceError，不填伪造0。
3. 在 [注册表](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/index.ts) 注册；用目录测试验证元数据可JSON传输。基础设置选项可从该注册表派生。
4. 若需要自动发现provider，在 [共享hints](https://github.com/takboo/dsh-usage-state/blob/main/src/shared/config.ts) 维护路由名/host规则并加冲突测试。注册Adapter不会自动识别新provider；宿主会将可用端点的origin提示经RPC传到两UI，扩展时校验不含userinfo/query/key。
5. 若新增窗口id或用户文案，同步 [中英词典](https://github.com/takboo/dsh-usage-state/blob/main/src/client/locales.ts)。窗口顺序由Adapter决定，展示层按返回顺序显示。
6. 补provider配置到fake fetch和RPC/显示的装配用例，再执行typecheck→build→test→pack。更新两份README、此文字段语义、Backlog验证状态和Unreleased。

开发命令和toolchain见 [开发指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/development.md)。新Adapter不应引入成本计算或历史记录。

## 归一化和错误约定

- 金额保留明确币种/单位，使用来源契约换算，不按数值大小猜“元或分”。数值必须有限；缺失与真实0分别处理。
- percentage已是0..100时用clampPercent。normalizePercent把0..1视为比例，因此1的解释有歧义；只在来源确需这种兼容时使用并注明。不得拿它解析明确的1%。
- used/limit只在limit有效且>0时换算；remaining需按来源说明反转。unlimited哨兵不能展示成负余额/负额度。
- normalizeResetAt支持unix秒、毫秒及ISO。不存在的重置时间保持undefined，不猜一个日期。
- normalizeBaseUrl去尾斜杠和/vN；provider声明端点目前先取origin。若来源路径有额外前缀，必须测试请求路径，不能假定都从根目录挂载。
- SourceError区分config/auth/http/network/parse；detail不得主动包含密钥。401/403由读取层归auth，JSON语法错归parse、body中断归network；HTTP200错误信封由Adapter识别。宿主快照边界精确替换本次已解析key的原文回显，不可依赖猜测key形状的正则。
- source+mode仍只选择一个目标，宿主用有效签名、私有凭据摘要和generation隔离身份/在途；不表示新增多账户，也不在Adapter另建缓存。
- 共享平台实例按DSH指南声明peer+dev，独立第三方依赖放dependencies；不要将旧宿主link解析经验写成所有平台包都不能import的规则。

归一化实现见 [normalize](https://github.com/takboo/dsh-usage-state/blob/main/src/host/sources/normalize.ts)，网络实现见 [read](https://github.com/takboo/dsh-usage-state/blob/main/src/host/read.ts)。

## 当前端点和字段语义

| 来源 | 请求及鉴权 | 读数语义与证据 |
|---|---|---|
| DeepSeek API | GET {base}/user/balance，Bearer | balance_infos多币种；优先有余额/CNY并保留granted/topped_up。有限真实0合法，非法total_balance跳过；无有效行抛parse |
| z.ai Coding Plan | GET {base}/api/monitor/usage/quota/limit，Bearer；默认open.bigmodel.cn，镜像api.z.ai | unit3→5h、6→7d；TOKENS_LIMIT/CREDIT_LIMIT读percentage，不将TIME_LIMIT混为编码额度；兼容plans/flat形态。HTTP200 success:false/code1000归auth；属社区接口观察，已有历史真机证据 |
| Moonshot API | GET api.moonshot.cn/v1/users/me/balance，Bearer | 官方data.available_balance以人民币元计，voucher/cash也为元，cash可为负；当前余额不按大小换单位，保留已有两位小数舍入及兼容字段，不新增负available_balance支持 |
| Kimi Code | GET api.kimi.com/coding/v1/usages，Bearer及KimiCLI/1.6 UA | 当前parse从usage读周窗口、limits[].detail/window读滚动窗口；UA/形态来自社区观察，缺真实账户验证 |
| OpenCode Zen Go | GET opencode.ai/zen/go/v1/usage，Bearer及浏览器UA | usage或data.usage；rolling/weekly/monthly→5h/7d/30d；percent为0..100；resetsAt归一。历史真机观察UA缺失触发Cloudflare；非零/status非ok未验证 |
| Sub2API | GET {instance}/v1/usage，Bearer；必须实例地址 | quota.remaining或wallet balance、rate_limits窗口；subscription.daily/weekly/monthly→1d/7d/30d。单位缺失默认USD；parse目前未按mode过滤，可能同时返回余额和窗口；接口字段随实例版本变化 |

[Moonshot官方余额定义](https://platform.kimi.com/docs/api/balance.md)优先于早期社区“分/元不明”的研究。[DeepSeek官方余额接口](https://api-docs.deepseek.com/api/get-user-balance)提供字段契约。其余社区/历史证据见 [研究索引](https://github.com/takboo/dsh-usage-state/blob/main/docs/research/README.md) 和 [上游分析](https://github.com/takboo/dsh-usage-state/blob/main/docs/research/dsh-cost-meter-analysis.md)，不能把逆向观察称为厂商保证。

## 端点策略和测试缺口

当前共享解析以显式provider覆盖→legacy source默认→provider声明origin/Adapter默认确定有效目标。ref和pin贯通读取/凭据描述；显式pin使fallbackRequests返回空列表。相关回归见 [A01](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md#a01)、[A03](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md#a03)。

无pin时首站失败仍按序尝试fallback，不仅在未配置端点时发生。扩展必须同时测Adapter、读取层和入口，覆盖真实HTTP、凭据选择、配置切换及错误边界，不能只证明一个模块接受参数。以上是Unreleased行为，npm0.4.4仍旧实现。
