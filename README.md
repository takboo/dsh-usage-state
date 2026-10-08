# dsh-usage-state

**中文** | [English](README.en.md)

在 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 输入框上方显示当前模型供应商的**账户余额**或**套餐额度**。状态行与输入卡片同宽，保留原生统计行和上下文计量器。

```text
z.ai / GLM · ◔ 5h 12% (4h0m) · ◔ 7d 59% (3d17h)
DeepSeek · ¥58.13
```

## 功能

- 已识别的供应商默认使用“自动”，复用DSH已有凭据；每个provider配置一次，模型列表用于参考。
- 显示余额、已用百分比、重置倒计时和SVG进度环；默认≥80%琥珀、≥95%红，可调整阈值和隐藏进度环。
- 源请求失败时保留上次成功读数并标记陈旧；当前失败展示和解析仍有例外，见下面的已知限制。
- 悬停查看数据源、模式、重置时刻及余额构成；中英界面跟随DSH语言设置。
- 只显示账户当前读数，不做成本归因、价格目录、预算或历史账单。

## 安装

要求：DSH版本满足 `>=0.2.0-rc.2 <0.3.0-0`，运行预构建插件声明Node≥20，安装到正在使用的 `web` profile。

```bash
dsh plugin --profile web add dsh-usage-state
# 安装后重启DSH；bundle patch在启动时读取
```

也可通过 [dsh-market](https://github.com/dsh-market/dsh-market) 搜索 `usage state` 或 `takboo` 安装。本插件已进入 [精选列表](https://awesome-dsh-plugin.com)；目录更新的可见时间取决于所用区域与成功构建。

从GitHub安装：

```bash
dsh plugin --profile web add github:takboo/dsh-usage-state
```

本仓库提交预构建产物，供DSH的GitHub安装路径直接使用。浮动GitHub分支可能领先于npm；复现问题时记录安装来源和版本/提交。不要把这一行为推广到所有npm Git安装。

DSH0.1使用历史版本0.3.2；该版本不适配0.2。0.4.0有RPC挂载缺陷，应升级至**最新兼容版**。完整版本记录见 [更新日志](CHANGELOG.md)。

## 快速开始

1. 打开 **设置→用量状态**，查看供应商、模型和检测到的数据源。
2. 对已识别供应商保留“自动”，或选择其支持的API、Coding Plan、隐藏。
3. 自建Sub2API在高级区填写实例地址；已配置模型的当前读数显示在输入框上方。
4. “立即刷新”用于主动查询；出错先查看设置页原因及 [排查指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/troubleshooting.md)。

高级区有数据源、端点、凭据名与密钥写入入口。**当前provider级凭据名覆盖没有进入请求链路**，不能据此认为已切换账户；零配置排序和端点固定也存在已知缺陷，详见限制。

## 数据源

| 来源 | API读数 | Coding Plan读数 | 主要凭据 |
|---|---|---|---|
| DeepSeek官方 | CNY/USD余额 | — | DEEPSEEK_API_KEY |
| z.ai / 智谱GLM | — | 5h / 7d已用% | ZAI_API_KEY等 |
| Kimi / Moonshot | 人民币余额，当前有单位错误 | Kimi Code订阅窗口 | MOONSHOT_API_KEY / KIMI_CODING_API_KEY |
| OpenCode Zen Go | — | 5h / 7d / 30d已用% | OPENCODE_GO_API_KEY / OPENCODE_API_KEY |
| Sub2API | 余额或key配额 | 按实例响应，如5h / 1d / 7d / 30d | SUB2API_API_KEY及实例地址 |

百分比表示**已用**。z.ai的key分国内/国际区域；默认国内地址，失败可尝试镜像。当前缓存按数据源与模式合并，不能将不同密钥/实例视为已支持独立多账户。厂商端点、字段和扩展步骤见 [适配器指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/adapters.md)。

## 截图

OpenCode Zen Go三个窗口，独立状态行位于输入框上方：

![输入框上方的账户读数](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/status-line.webp)

每个provider一行的设置页，以及高级设置：

![供应商设置](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-providers.webp)

![高级设置](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-advanced.webp)

## 刷新与凭据

宿主默认在回合结束2秒后刷新，并有5分钟兜底定时器；浏览器每30秒拉取RPC，而该RPC也触发源查询。成功读数的默认最小间隔是60秒，因此浏览器打开时空闲查询通常约每分钟发生。显式刷新可绕过间隔，失败可立即重试；修改空闲间隔暂未重调定时器。

插件查询余额/额度并读取当前模型及供应商目录，不写会话日志，也不向第三方上报这些读数。宿主不把已保存的密钥值返回浏览器；用户主动粘贴的草稿经DSH凭据服务写入所用home的凭据文件。环境变量值优先，通常不能在设置页修改。

## 已知限制

本段对应当前实现，文档重构没有修复这些代码问题。完整状态及验收标准见 [待办清单](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md)。

- **凭据/端点**：高级凭据名覆盖失效；固定z.ai端点可能仍试镜像；换端点/凭据后缓存可能保留旧身份读数。自定义provider仅靠端点识别时，客户端可能误报未配置。
- **金额**：Moonshot≥100元会被错误除以100，应以 [官方余额接口](https://platform.kimi.com/docs/api/balance.md) 为准；DeepSeek非法/缺失金额可能被当成0，不能把这种0当作账户耗尽的可靠证据。
- **交互和失败**：零配置供应商↑↓可能无效；旧值悬停不总能带出具体错误；RPC断线后的旧值可能未标陈旧；legacy模型配置可能绕过隐藏并继续轮询。
- **未验证范围**：Kimi Code/Sub2API真实账户、高阈值视觉、手写凭据生效和OpenCode非零路径仍缺活体验证。
- **范围**：无模型选择或隐藏时可以不显示；点击状态行不打开设置；不保存历史读数。

## 开发与文档

开发需要Node22.18+的22线或Node24.11+，高于运行产物声明。基本检查：

```bash
npm ci
npm run typecheck
npm run build
npm test
```

本地profile、watch和HMR前提见 [开发指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/development.md)。按任务查找架构、设计、发布、审计和研究材料见 [文档导航](https://github.com/takboo/dsh-usage-state/blob/main/docs/index.md)。

## 致谢与许可

感谢 [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)（Han-1413141，MIT）提供的数据源行为参考。本实现独立编写；端点、字段语义与兼容陷阱的溯源见 [上游分析](https://github.com/takboo/dsh-usage-state/blob/main/docs/research/dsh-cost-meter-analysis.md)。宿主平台为DSH，使用其设置、凭据、RPC、插槽和UI原语。

[MIT](LICENSE)。问题和署名建议通过 [Issues](https://github.com/takboo/dsh-usage-state/issues) 提交。
