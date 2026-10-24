# dsh-usage-state

**中文** | [English](README.en.md)

[![CI](https://github.com/takboo/dsh-usage-state/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/takboo/dsh-usage-state/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/dsh-usage-state)](https://www.npmjs.com/package/dsh-usage-state)

> **0.4.10** 已验证 DSH **0.2.1-rc.3** 兼容性，支持新版动态模型目录，保留账号登录与 API Key 独立余额查询。安装包及校验文件见 [GitHub Release](https://github.com/takboo/dsh-usage-state/releases/tag/v0.4.10)，详情见 [更新日志](CHANGELOG.md#0410---2026-10-24)。

在 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 输入框上方显示当前模型供应商的**账户余额**或**套餐额度**。状态行与输入卡片同宽，保留原生统计行和上下文计量器。

```text
z.ai / GLM · ◔ 5h 12% (4h0m) · ◔ 7d 59% (3d17h)
DeepSeek · ¥58.13
```

## 功能

- 已识别的供应商默认使用“自动”，复用DSH已有凭据；每个provider配置一次，模型列表用于参考。
- 显示余额、已用百分比、重置倒计时和SVG进度环；默认≥80%琥珀、≥95%红，可调整阈值和隐藏进度环。
- 同一有效账户身份的源请求失败时保留上次成功读数并标记陈旧、年龄和原因；RPC传输失败也会明确标出旧值。
- 悬停查看数据源、模式、重置时刻及余额构成；中英界面跟随DSH语言设置。
- 只显示账户当前读数，不做成本归因、价格目录、预算或历史账单。

## 安装

要求：DSH版本满足 `^0.2.0-rc.2 || ^0.2.1-rc.1`（已验证0.2.0-rc.2及0.2.1-rc.1/rc.2/rc.3），运行预构建插件声明Node≥20，安装到正在使用的 `web` profile。

从npm安装：

```bash
dsh plugin --profile web add dsh-usage-state
# 安装后重启DSH；bundle patch在启动时读取
```

也可从GitHub安装：

```bash
dsh plugin --profile web add github:takboo/dsh-usage-state
```

本仓库提交预构建产物，供DSH的GitHub安装路径直接使用。浮动GitHub分支可能领先于npm；复现问题时记录安装来源和版本/提交。不要把这一行为推广到所有npm Git安装。

也可通过 [dsh-market](https://github.com/dsh-market/dsh-market) 搜索 `usage state` 或 `takboo` 安装；安装后核对实际来源与版本。本插件已进入 [精选列表](https://awesome-dsh-plugin.com)；目录更新的可见时间取决于所用区域与成功构建。

DSH0.1使用历史版本0.3.2；该版本不适配0.2。0.4.0有RPC挂载缺陷，应升级至**最新兼容版**。完整版本记录见 [更新日志](CHANGELOG.md)。

## 快速开始

1. 打开 **设置→用量状态**，查看供应商、模型和检测到的数据源。
2. 对已识别供应商保留“自动”，或选择其支持的API Key余额、账号余额、Coding Plan、隐藏。
3. 自建Sub2API在高级区填写实例地址；已配置模型的当前读数显示在输入框上方。
4. “立即刷新”用于主动查询；出错先查看设置页原因及 [排查指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/troubleshooting.md)。

高级区提供数据源选择；API Key模式另有端点、凭据名和密钥写入入口。显式provider覆盖优先于旧source默认；凭据描述与读取共用候选顺序，保存优先写显式ref。固定端点不试镜像，配置或凭据身份变化后清除旧身份读数。只读配置与凭据写入权限分别处理，保存/清除过程会显示失败并禁用重复操作。

## 数据源

| 来源 | 余额读数 | Coding Plan读数 | 主要凭据 |
|---|---|---|---|
| DeepSeek官方 API Key | CNY/USD余额 | — | DEEPSEEK_API_KEY |
| DeepSeek账号登录 | CNY/USD充值与赠送余额 | — | Harness当前登录账号 |
| z.ai / 智谱GLM | — | 5h / 7d已用% | ZAI_API_KEY等 |
| Kimi / Moonshot | 人民币余额 | Kimi Code订阅窗口 | MOONSHOT_API_KEY / KIMI_CODING_API_KEY |
| OpenCode Zen Go | — | 5h / 7d / 30d已用% | OPENCODE_GO_API_KEY / OPENCODE_API_KEY |
| Sub2API | 余额或key配额 | 按实例响应，如5h / 1d / 7d / 30d | SUB2API_API_KEY及实例地址 |

**DeepSeek 桌面端账号登录**：`deepseek-account` 路由自动选择「账号余额」，通过 Harness 登录服务读取充值与赠送余额之和，无需 API Key；`deepseek-official` 路由选择「API Key 余额」。两者独立查询和缓存，账号模式不会探测或回退使用 `DEEPSEEK_API_KEY`。请在 Harness 账号设置中登录；账号模式要求宿主提供账号服务；旧宿主缺少该服务时需升级宿主。账号模式的端点与登录凭据由宿主管理，高级区不提供 API Key 输入。

Kimi Code 的 `kimi-code`、`kimi-coding`、`kimi-for-coding` provider，以及声明 `api.kimi.com` / `api.kimi.ai` 的自定义 provider，会自动读取套餐用量。支持 5h、7d、月总额度及编程月用量，仅展示账户实际返回的窗口。Moonshot 国内/国际 API 继续显示人民币余额；可在设置中显式选择模式。

百分比表示**已用**。z.ai的key分国内/国际区域；默认国内地址，失败可尝试镜像。当前缓存按数据源与模式合并，不能将不同密钥/实例视为已支持独立多账户。厂商端点、字段和扩展步骤见 [适配器指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/adapters.md)。

## 截图

OpenCode Zen Go三个窗口，独立状态行位于输入框上方：

![输入框上方的账户读数](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/status-line.webp)

每个provider一行的设置页，以及高级设置：

![供应商设置](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-providers.webp)

![高级设置](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-advanced.webp)

## 刷新与凭据

宿主默认在回合结束2秒后调度刷新，并有5分钟兜底定时器；浏览器每30秒拉取RPC镜像。普通轮询仅在读数缺失或有效身份变化时初始化查询，不把idle查询改成每分钟一次。成功请求的默认最小间隔为60秒，显式刷新可绕过，失败的主动重试不受该成功间隔限制；修改空闲间隔会重调定时器。

插件查询余额/额度并读取当前模型及供应商目录，不写会话日志，也不向第三方上报这些读数。宿主不把已保存的密钥值返回浏览器；用户主动粘贴的草稿经DSH凭据服务写入所用home的凭据文件。凭据优先级跟随宿主：DSH 0.2.1-rc.1/rc.2/rc.3 的 Web/桌面端优先使用已保存凭据，环境变量作为回退；0.2.0-rc.2 则优先使用环境变量。凭据权限以设置页实际返回为准。

## 已知限制

完整整改状态及验证范围见 [待办清单](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md)。

- **账户范围**：仍按source+mode选择一个目标；配置身份隔离不等于新增独立多账户支持。
- **未验证范围**：本次账号模式的真实 Desktop 登录账户与视觉、Kimi Code月额度真实账户、Sub2API真实账户、高阈值视觉、真实凭据写入和OpenCode非零路径仍缺活体验证；本地交互测试不代替这些验收。
- **范围**：无模型选择或隐藏时可以不显示；点击状态行不打开设置；不保存历史读数。

## 开发与文档

开发兼容下界为Node22.18+的22线或Node24.11+；规范构建固定Node **24.21.0**（[.node-version](https://github.com/takboo/dsh-usage-state/blob/main/.node-version)）和npm **11.19.1**（packageManager），高于运行产物声明。基本检查：

```bash
npm ci
npm run typecheck
npm run build
npm test
```

本地profile、watch和HMR前提见 [开发指南](https://github.com/takboo/dsh-usage-state/blob/main/docs/development.md)。按任务查找架构、设计、发布、审计和研究材料见 [文档导航](https://github.com/takboo/dsh-usage-state/blob/main/docs/index.md)。

## 致谢与许可

感谢 [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)（Han-1413141，MIT）提供的数据源行为参考。本实现独立编写；历史端点与行为溯源见 [归档上游分析](https://github.com/takboo/dsh-usage-state/blob/main/docs/archive/research/dsh-cost-meter-analysis.md)。宿主平台为DSH，使用其设置、凭据、RPC、插槽和UI原语。

[MIT](LICENSE)。问题和署名建议通过 [Issues](https://github.com/takboo/dsh-usage-state/issues) 提交。
