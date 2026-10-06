# 更新日志（Changelog）

所有对外可见的变更按版本记录于此。每条决策"为什么改"的来龙去脉见 [`docs/design-changelog.md`](docs/design-changelog.md)（修订记录）；发布与验证的操作记录见 [`docs/release.md`](docs/release.md)。

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号遵循语义化版本。`0.3.0` 起发布 npm（此前仅 GitHub 安装）。

## [Unreleased]

### 0.4.4（待发布）

- **纯文档发布**：README 与实际行为对齐（SVG 进度环、输入框上方独立一行、版本清单补全），文档结构重组（架构 / 平台事实 / 发布 / 待办 / 设计修订各自成档）；`CHANGELOG.md` 自本版起随包发布。`lib/` 与 0.4.3 逐字节相同，无任何运行时变更。

## [0.4.3] - 2026-10-05

- **进度显示改为 SVG 圆环**：平台 `ContextMeter` 同款几何（14×14、r=5.5、2px 描边、12 点起弧），替代 `█`/`░` 文字条（其字形回落宽度不可控，见修订 21/23）。阈值变色经 `currentColor` 传导到环上；`display.progressBar` 配置键保留（关掉即隐藏环）。
- **排版对齐平台统计行**：字号/行高照抄 `StatsPills` 的显式表达式（修订 22）。
- **折行修复**：分隔符与它引导的段落同盒（`data-usage-part`），折行不再留下孤立的 `·`（修订 21）。
- 数据模型：`StatusSegment.bar?: string` → `progress?: number`。

## [0.4.2] — 2026-10-05

- 状态行迁到 **`conversation.input.dock`**（输入框上方、与输入卡片同宽的独立一行，`order: 200`）。0.2 里 `conversation.composer.dock` 是与平台统计、上下文计量器共排的一排 pill，不存在"输入框之下"的整行位置（修订 20）。

## [0.4.1] — 2026-10-05

- **修复 0.4.0 读数全缺**：客户端 RPC contribution 的参数 codec 缺少 0.2 要求的 `create()` 工厂，`remote.usageState` 从未挂载，界面误报 `Mode not supported`（修订 18）。**0.4.0 用户必须升级。**
- 挂载失败不再被静默吞掉（`console.error` + 写入 store）；catalog 未到时显示"读取中"而不是"模式不支持"。
- dock 布局适配：与平台 `.pill` 同构，不再挤压/裁切平台统计（修订 19）。
- 新增**真实 0.2 registry 契约测试**（源码与构建产物各一条，修订 18）。

## [0.4.0] — 2026-10-05

- **迁移到 DSH 0.2 原生设置模型**：宿主 `Config = z.any().volatile()` + `configForms` + `configEditor`；0.2 删除了 `settingsScope` / `settings.register`，两套 API 无重叠（修订 17）。`engines.dsh` 收紧为 `>=0.2.0-rc.2 <0.3.0-0`；0.1 线用户请停在 `0.3.2`。
- `peerDependencies` 新增 `@deepseek-ai/dsh-settings`（让 0.1.x 宿主在**安装时**被运行时闸门拒绝，而不是装上后启动崩溃）与 `@deepseek-ai/schemastery`。
- `cordis.patch.yml` 插入行补 `config: {}`，避免新装实例状态行沉默。
- ⚠️ 本版有读数缺失缺陷（见 0.4.1）。

## [0.3.2] — 2026-09-30

- 仅放宽 `engines.dsh` 到 `>=0.1.5-rc.1 <0.3.0-0`；源码与产物零改动（修订 16）。
- ⚠️ **0.1 线末版**。它声称的 0.2 兼容后来被真机推翻（0.2 删除了 `settingsScope`，装上会让 web 启动失败，修订 17）——0.2 宿主请装 `0.4.x`。

## [0.3.1] — 2026-09-22

- 移除 `peerDependencies.react`：浏览器半边的 React 由平台运行时注入，不走 node_modules，声明它只会产生 `missing peer` 警告（修订 15）。

## [0.3.0] — 2026-09-22

- **移除回合行**：账户级读数不能诚实地描述单个回合，`conversation.chat.*` 上的展示整体否决（修订 13；可行性实验见修订 8）。
- 去掉 `private`，**首次发布 npm** 并被 dsh-market 收录（分类 `usage`，修订 14）；`engines.dsh` 随包声明（市场徽标与兼容判定读它）。

## [0.2.3] — 2026-09-22

- 设置页卡头部改两列网格：provider 名过长时只截断灰色的 id（悬停看全文），`↑ ↓ 模式` 控件永不换行（修订 12）。
- README 增补对上游 `dsh-cost-meter` 的溯源致谢。

## [0.2.2] — 2026-09-21

- 三处健壮性修复；不再轮询已删除的 provider。

## [0.2.1] — 2026-09-21

- 修复"幽灵 provider 行"（已删除的 provider 仍出现在设置页）。

## [0.2.0] — 2026-09-21

- 新增数据源 **OpenCode Zen Go**（5h / 7d / 30d；修订 11）。通往同一账户的两条 DSH 路由按 `source:mode` 去重，只发一次请求。

## [0.1.0] — 2026-09-21

- 首版：数据源适配器框架 + DeepSeek / z.ai / Kimi / Sub2API 四家、composer 状态行（余额 / 5h·7d 已用百分比 + 倒计时 + 阈值变色）、设置页（provider 四态 + 排序 + 密钥写入）、凭据探测与直读兜底、Typert RPC 快照通道、中英双语、`node:test` 单测。

[Unreleased]: https://github.com/takboo/dsh-usage-state/compare/0.4.3...HEAD
[0.4.3]: https://github.com/takboo/dsh-usage-state/compare/0.4.2...0.4.3
[0.4.2]: https://github.com/takboo/dsh-usage-state/compare/0.4.1...0.4.2
[0.4.1]: https://github.com/takboo/dsh-usage-state/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/takboo/dsh-usage-state/compare/0.3.2...0.4.0
[0.3.2]: https://github.com/takboo/dsh-usage-state/compare/0.3.1...0.3.2
[0.3.1]: https://github.com/takboo/dsh-usage-state/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/takboo/dsh-usage-state/compare/0.2.3...0.3.0
[0.2.3]: https://github.com/takboo/dsh-usage-state/compare/0.2.2...0.2.3
[0.2.2]: https://github.com/takboo/dsh-usage-state/compare/0.2.1...0.2.2
[0.2.1]: https://github.com/takboo/dsh-usage-state/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/takboo/dsh-usage-state/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/takboo/dsh-usage-state/releases/tag/0.1.0
