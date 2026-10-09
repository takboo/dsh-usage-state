# 更新日志（Changelog）

用户可见的变更按版本记录于此。设计取舍见 [设计修订](https://github.com/takboo/dsh-usage-state/blob/main/docs/design-changelog.md)，发布验证流程见 [发布与验收](https://github.com/takboo/dsh-usage-state/blob/main/docs/release.md)。

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。0.3.0起发布npm，之前仅GitHub分发。已发布日期按 [npm registry](https://registry.npmjs.org/dsh-usage-state) 的UTC记录；历史比较引用说明见文末。

## [Unreleased]

### Fixed

- provider级凭据覆盖贯通读取、描述和保存；显式provider端点/ref优先于legacy source默认，固定端点不尝试镜像。
- Moonshot余额按官方人民币元解析；DeepSeek跳过非法金额，无有效读数时报parse并保留同身份旧成功值；响应体超时/中断归network。
- 宿主按有效目标签名、私有凭据摘要和generation隔离缓存/在途；拒绝配置切换、ABA、晚lookup和晚HTTP的旧结果，目标移除及stop不再触发后续查询。已解析密钥的原文回显在快照错误边界精确替换。
- legacy models仅通过normalize迁移，权威空provider目录停止轮询；普通getState只初始化缺失/变更身份，浏览器30s轮询不缩短5min宿主idle，间隔修改会重调timer。
- origin-only endpointHints传到设置页和状态行；默认provider按可见顺序排序；旧值tooltip含原因，RPC断线标年龄/陈旧。客户端配置身份失效后拒绝旧RPC，普通请求中的显式刷新排一次，已有force则共享。
- 配置写入false/rejection、凭据保存/清除失败与pending均有反馈；配置只读和凭据权限分开，未编辑输入框失焦不写回旧草稿。

### Engineering

- 新增标准Ubuntu CI、Dependabot和默认verify的手动Release；action固定完整SHA，npm OIDC与GitHub附档分离权限，复用同一已验证tarball和checksum。
- 新增metadata、已提交产物、实际tarball、稳定发布tag和预构建runtime门禁；必要产物缺失改为硬失败，不再skip。规范工具链固定Node24.21.0/npm11.19.1，锁文件根版本同步0.4.4。
- schemastery peer/dev下界更正为3.18.3（3.18.2缺少volatile能力），锁定解析版本3.18.4；没有扩大DSH发布线范围。
- 本轮包号仍0.4.4，整改尚未npm发布；远端main保护、trusted publisher、Actions实跑和新tag/Release仍需后续配置/验收。

### Documentation

- 精简中英README，增加任务导航、领域术语、开发指南和用户排查；区分当前Unreleased与已发布npm0.4.4。
- 设计、架构、适配器、平台和发布文档同步本地实现及验证边界；A01–A17状态归入唯一Backlog，历史研究与修订1–24保留。
- 0.4.4发布日期和历史提交引用已校正；真实账户、视觉及实际凭据写入验证仍未新增。

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
