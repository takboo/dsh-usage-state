# 待办与路线（Backlog）

这是本仓库**唯一的**待办清单。此前散落在 `implementation.md` §6、`design-consensus.md` §11、`adapters.md` 候选清单与文末维护备忘里的待办已全部收敛到这里；其余文档只链接本文件，不再各自维护一份。

条目规则：做完了就从这里划掉（或连同证据写进 [CHANGELOG](../CHANGELOG.md)）；否决了就移到「明确不做」并注明理由与出处。

## 1. 未用真实数据验证（代码与单测已就绪）

1. **Kimi**（Moonshot 余额 + Kimi Code 窗口）——本机无 key；`sk-kimi-*` + `KimiCLI/1.6` UA 的要求来自[侦察](research/README.md)，未经真机确认。
2. **Sub2API**——本机没有自建实例；`/v1/usage` 是未文档化接口且字段漂移过，实现按容错处理。
3. **阈值变色的视觉（warn / critical）**——代码路径已实现且被渲染测试钉住（`severityColor()` → `currentColor` 传导到圆环描边），但真机读数长期低于阈值，**没有琥珀/红色的高阈值视觉样本**。验证办法：把设置里的黄色阈值临时改成 10 即可看到。
4. **手写密钥写入→生效**——设置页可写，但本机凭据来自环境变量/凭据文件，未实际走一遍「粘贴 → 写入凭据库 → 读数生效」。
5. **OpenCode Zen Go 的非零路径**——真机三个窗口都返回 `0%`（账户未用），`percent > 0` 的显示、阈值变色与窗口排序没有真机样本；`status` 字段只见过 `"ok"`。若将来出现非 `ok` 且 `percent: 0`，当前会显示 0% 而不是报错（无取值证据前不臆造，故未做映射）。

## 2. 已识别、尚未实现

1. **点击状态行进入设置页**——设计里写过"可点进设置"，但客户端没有公开的"打开设置面板"服务；已按修订 5 改用悬浮提示承载细节。等平台提供公开服务后再做。
2. **`.d.ts` 产物**——`tsdown` 配置 `dts: false`（运行时消费不需要类型声明）。有第三方要复用类型时再开。

## 3. 候选数据源（未实现）

> 已侦察确认存在（侦察材料见 [`research/provider-balance-quota-apis.md`](research/provider-balance-quota-apis.md)），但大多**不适合 v1 的凭据模型**（只支持环境变量风格字符串密钥，经 DSH 凭据库存取）。适配器写法见 [`adapters.md`](adapters.md)。

| 厂商 | 端点 | 为什么还没做 |
|---|---|---|
| Anthropic Claude Pro/Max | `GET https://api.anthropic.com/api/oauth/usage` | 必须 OAuth 访问令牌（`user:profile`），普通 API key 无法调用；需要新增 OAuth 凭据的存取通道。返回 `five_hour` / `seven_day` 的 `utilization` + `resets_at`，是最标准的 5h/7d 形态 |
| Codex / ChatGPT 订阅 | `GET https://chatgpt.com/backend-api/wham/usage` | 需要 ChatGPT OAuth；`rate_limit.primary_window`（18000s）与 `secondary_window`（604800s） |
| MiniMax Token Plan | `GET https://www.minimaxi.com/v1/token_plan/remains` | 纯 API key，**可以**按现有模板实现：`current_interval_remaining_percent` / `current_weekly_remaining_percent`（注意是"剩余"，要反转） |
| Kimi Code 国际版 | `GET https://api.kimi.com/coding/v1/usages` | 与已实现的国内版同端点，无需新增 |
| OpenRouter | `GET {base}/api/v1/credits`、`/api/v1/key` | 余额接口按官方 OpenAPI 需要 management key；`/key` 的 `limit_remaining/limit` 可换算已用 %，但无 5h/7d 概念 |
| SiliconFlow | `GET https://api.siliconflow.cn/v1/user/info` | 纯 CNY 余额，可照模板实现 |
| CommandCode | `GET https://api.commandcode.ai/alpha/billing/credits` | 返回 `windowLimits.{fiveHour,weekly}.{used,cap,resetAt}`，形态与现有窗口模型几乎一致 |
| Volcengine Ark Coding Plan | `open.volcengineapi.com` 控制面 | 需要 AK/SK HMAC 签名，凭据形态超出 v1 |
| Gemini Code Assist / Antigravity | 私有端点 / 本地语言服务 | OAuth 或本地进程通信，且 Google 已关闭个人版 CLI OAuth |

**优先级建议**：MiniMax → CommandCode → SiliconFlow（都是纯 API key、返回结构简单），再考虑为 Anthropic / Codex 增加 OAuth 凭据通道。

## 4. 维护待办

1. **DSH 出现 0.3 发布线时复核 `engines.dsh` 区间**（当前 `>=0.2.0-rc.2 <0.3.0-0`，0.3 的一切预发布都会被判 incompatible——市场对 `engines` 是硬判定：`findCompatibleVersion()` 只挑 `compatible` 的版本，update 路由还会在安装前拒绝声明不兼容的版本）。**平台破坏性变更已发生过两次**（0.1.7 去掉 `installSettingsSection`、0.2 去掉 `settingsScope` / `settings.register`，后者让修订 16 的"两线兼容"结论被真机推翻），所以每次跳发布线都要跑 [`release.md`](release.md) 的六步复核，不能只看"入口在列"。
2. **平台若调整自身统计行的字号表达式**，`StatusLine.tsx` 里照抄的两行要与平台同步（渲染测试把它们钉成了契约，改平台时测试会提醒）。
3. **市场元数据维护**：改描述只改 awesome-dsh-plugin 仓库里自己那条 yml；换截图只改本仓库的 `screenshots.json`。都不改对方生成的 README（会覆写）。
   **当前欠账**：条目 [`takboo__dsh-usage-state.yml`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/takboo__dsh-usage-state.yml) 的描述仍写 "in one line under the composer / 在输入框统计行下方"——那是 0.3.x 时代的位置，0.4.2 起状态行在输入框**上方**（修订 20）。市场要求描述与源码逐句相符。**更正 PR 已提**：[awesome-dsh-plugin#6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622)，等 CI（`check` 逐句核源码，较慢）与合并；合并后中国区市场要等次日 `dsh-plugin-catalog` 每日构建才可见（见 [`release.md`](release.md) 第 6 条）。

## 5. 明确不做（否决护栏）

与[设计共识](design-consensus.md)一致，以下需求已被**明确否决**，不要顺手加回来：

- 会话成本统计、模型价格目录、历史账单、预算、峰谷计价、native-search 计费、网关额度、自定义余额端点——砍掉这些正是本插件存在的理由（替代 `dsh-cost-meter` 的展示需求）。
- **按回合展示账户读数**——账户级读数无法诚实描述单个回合，修订 13 整体否决；将来若做账户历史轨迹，口径必须是**时间**而不是回合，且需新写一条修订。
- **往会话日志写入自有事件**——0.1.5-rc.2 的写侧没有 `ignorable` 入口，写入会让别人的读取器拒绝重建整个会话（见 [`platform-notes.md`](platform-notes.md) 第 11 条）。
- **影子替换原生统计行**——原生 `StatsPills` 与上下文计量器保持原样，不做复刻（修订 4）。
