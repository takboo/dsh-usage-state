# 更新日志（Changelog）

用户可见的变更按版本记录于此。设计取舍见 [设计修订](https://github.com/takboo/dsh-usage-state/blob/main/docs/design-changelog.md)，发布验证流程见 [发布与验收](https://github.com/takboo/dsh-usage-state/blob/main/docs/release.md)。

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。0.3.0起发布npm，之前仅GitHub分发。已发布日期按 [npm registry](https://registry.npmjs.org/dsh-usage-state) 的UTC记录；历史比较引用说明见文末。

## [Unreleased]

### Documentation

- 精简中英README，增加任务导航、领域术语、开发指南和用户排查，明确现有功能与关键缺陷。
- 重写设计、架构、适配器、平台及发布说明，区分约定、实际实现、验证范围和历史证据；更正开发Node下限、HMR条件、刷新行为、Moonshot单位与市场兼容规则。
- 将A01–A17审计整改纳入唯一Backlog，保留代码待修状态；修正0.4.4已发布记录和不存在的标签链接。
- 本轮未修改运行实现或预构建产物，未新增CI或发布版本。

## [0.4.4] - 2026-10-06

- 更新README中的SVG进度环、输入框上方独立行和版本导航文案，拆分维护文档的职责。
- CHANGELOG自本版起随npm包发布；预构建lib与0.4.3相同，无预构建运行代码变更。

## [0.4.3] - 2026-10-05

- **进度显示改为SVG圆环**：平台ContextMeter同款几何（14×14、r=5.5、2px描边、12点起弧），替代文字条（字形回落问题见修订21/23）。阈值变色经currentColor传导到环，沿用display.progressBar配置键。
- 字号/行高照抄平台统计行的显式表达式（修订22）。
- 分隔符与它引导的段落同盒，折行不再留下孤立的分隔符（修订21）。
- 显示模型从文字bar改为数值progress。

## [0.4.2] - 2026-10-05

- 状态行迁到conversation.input.dock，位于输入框上方、与输入卡片同宽、order=200；保留原生统计行（修订20）。
- 此前GitHub开发阶段对共享dock的适配记录在修订19，最终随本版迁为上方独立行；不把该后续提交误列为npm0.4.1已发布内容。

## [0.4.1] - 2026-10-05

- **修复0.4.0读数全缺**：客户端RPC贡献参数codec缺少0.2要求的create()，remote.usageState未挂载，界面误报Mode not supported（修订18）。0.4.0用户应升级至最新兼容版。
- 挂载失败记录console.error和store错误；catalog未到时显示读取中。
- 新增真实0.2 registry契约测试，源码与构建产物各一条。

## [0.4.0] - 2026-10-05

- 迁移到DSH0.2的Config/configForms/configEditor设置模型；旧settingsScope/settings.register已移除（修订17）。支持范围收紧为 `>=0.2.0-rc.2 <0.3.0-0`。
- 新增dsh-settings与schemastery peer声明，并在patch中提供config:{}。
- 本版仍有客户端RPC挂载缺陷，随后由0.4.1修复。

## [0.3.2] - 2026-09-30

- 仅放宽engines.dsh，源码与产物未改（修订16）。
- 0.1线末版；声称的0.2兼容后来被真机推翻。DSH0.2不能使用本版，需最新兼容0.4系列。

## [0.3.1] - 2026-09-22

- 移除React runtime peer，浏览器React由平台模块表提供；React仍作开发依赖（修订15）。

## [0.3.0] - 2026-09-22

- 移除回合行，账户当前读数只在输入区域显示（修订13）。
- 首次发布npm，去掉private并声明engines.dsh；进入dsh-market收录链路（修订14）。

## [0.2.3] - 2026-09-22

- 设置页头部改两列网格，长provider名截断，不挤走控件（修订12）。
- README补充上游行为参考与致谢。

## [0.2.2] - 2026-09-21

- 三处健壮性修复，宿主不再轮询已删provider。

## [0.2.1] - 2026-09-21

- 修复已删provider仍留在设置页的幽灵行。

## [0.2.0] - 2026-09-21

- 新增OpenCode Zen Go来源，5h/7d/30d；同源模式合并路由（修订11）。

## 0.1.0 - 2026-09-21

- 首版：四家适配器、宿主缓存/RPC、输入区域状态行、provider配置与中英UI。
- 首版完整发布提交尚未确认，不链接不存在的版本标签。

## 历史引用说明

核验时仓库没有版本tag/Release。0.3.0及之后的比较端点来自各npm版本的gitHead；0.2系列引用对应实现提交，不能替代当时没有保存的正式发布产物。早期日期沿用历史版本记录。今后版本应按发布流程建立稳定引用。

[Unreleased]: https://github.com/takboo/dsh-usage-state/compare/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb...HEAD
[0.4.4]: https://github.com/takboo/dsh-usage-state/compare/885541638ffa4da05b39bd1864085ba6d9acc288...3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb
[0.4.3]: https://github.com/takboo/dsh-usage-state/compare/0d2d4376d0db990fb36df5d6124e5b7894974d62...885541638ffa4da05b39bd1864085ba6d9acc288
[0.4.2]: https://github.com/takboo/dsh-usage-state/compare/e5ef97375d01faf9073ef5e4c7522f6ff59514f9...0d2d4376d0db990fb36df5d6124e5b7894974d62
[0.4.1]: https://github.com/takboo/dsh-usage-state/compare/d93e2c7cdbbba76346d753171b2a4c8408793fc2...e5ef97375d01faf9073ef5e4c7522f6ff59514f9
[0.4.0]: https://github.com/takboo/dsh-usage-state/compare/d9e08c8765ff89b9dc57b8ac56ee4c61412176d6...d93e2c7cdbbba76346d753171b2a4c8408793fc2
[0.3.2]: https://github.com/takboo/dsh-usage-state/compare/9f8b863339ebf552478e48c93cc80641f5e2ecb5...d9e08c8765ff89b9dc57b8ac56ee4c61412176d6
[0.3.1]: https://github.com/takboo/dsh-usage-state/compare/098a31c5b01c600a42ce5bc86d51627ec97b2b16...9f8b863339ebf552478e48c93cc80641f5e2ecb5
[0.3.0]: https://github.com/takboo/dsh-usage-state/compare/dd37b3d...098a31c5b01c600a42ce5bc86d51627ec97b2b16
[0.2.3]: https://github.com/takboo/dsh-usage-state/compare/7adb90e...dd37b3d
[0.2.2]: https://github.com/takboo/dsh-usage-state/compare/e4d40d7...7adb90e
[0.2.1]: https://github.com/takboo/dsh-usage-state/compare/c01a64f...e4d40d7
[0.2.0]: https://github.com/takboo/dsh-usage-state/commit/c01a64f
