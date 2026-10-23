# 历史归档

这里保存带日期/版本的调查、决策与验收证据，2026-10-23从当前工作路径移出。**正文中的“当前”“待办”、命令、本机路径和测试数字均只指历史基线。** 当前接手入口是 [文档导航](../index.md)，开放事项是 [待办](../backlog.md)，发布事实是 [Changelog](../../CHANGELOG.md)。

归档正文通过本目录 `.ignore` 从默认ripgrep搜索隐藏，显式检索可用 `rg --no-ignore <pattern> docs/archive`。仅在追溯相关问题或重新调查时读取下列材料；先核对 owning source，再采用旧结论。旧报告中的建议顺序不构成新的实施计划。

| 归档 | 基线 | 保留原因 |
|---|---|---|
| [审计后续](audit-follow-up-2026-10-17.md) | 0.4.5–0.4.8 | A01–A17修复位置及早期CI/发布证据 |
| [历史验收](validation-2026-10-10.md) | 2026-10-08/10 | 本地候选与正式0.4.5分发字节的区别 |
| [平台兼容记录](platform-compatibility-2026-10-17.md) | DSH0.1/0.2，0.4.7/0.4.8 | 版本限定的探针及隔离浏览器验收 |
| [设计修订](design-changelog.md) | 早期实现至0.4.8 | 已废弃方案、原因和代价 |
| [余额/额度接口调查](research/provider-balance-quota-apis.md) | 2026-09-20 | 官方与社区接口矩阵；未文档化接口需重查 |
| [Sub2API调查](research/sub2api-gateway.md) | 2026-09-20固定源码 | 同名项目辨析与响应字段证据 |
| [上游插件分析](research/dsh-cost-meter-analysis.md) | dsh-cost-meter1.7.28 | 来源行为与署名溯源 |
| [Typert调查](research/typert-rpc-minimal-contract.md) | DSH0.1.5-rc.2 | 原始协议证据；其codec示例不适用于当前0.2 |
| [原仓库审计](research/repository-audit-2026-10-08.md) | 3ad9a71 / 0.4.4 | 当时17项发现及复现，不是当前缺陷列表 |
| [发布与市场调查](research/repository-release-standards-2026-10.md) | 2026-10-08 | 官方规范、固定commit和Moonshot元单位勘误 |

Moonshot早期按数值大小猜分/元的启发式已在0.4.5移除；按当前适配器的官方元单位读取。DeepSeek旧API-only结论已由0.4.9账号模式补充。0.1客户端codec不能证明0.2挂载兼容；当前要求见 [平台说明](../platform-notes.md)。
