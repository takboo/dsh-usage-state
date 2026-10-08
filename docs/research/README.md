# 研究索引

这里保存调查与审计的事实快照，供当前设计和实现引用。当前文档从 [任务导航](../index.md) 进入；设计约定见 [设计共识](../design-consensus.md)，实际实现见 [架构](../architecture.md)，未完成状态只在 [Backlog](../backlog.md) 更新。

## 报告

| 文档 | 基线/时间 | 内容与可信度 |
|---|---|---|
| [接口调查](provider-balance-quota-apis.md) | 2026-09-20，DSH0.1.5环境 | 官方文档和社区实现的余额/额度矩阵；未文档化端点与授权结论需重新核验 |
| [Sub2API调查](sub2api-gateway.md) | 2026-09-20，固定上游commit | 网关/同名fork辨析及key端点；字段漂移、活体502，没有证明所有实例相同 |
| [上游插件分析](dsh-cost-meter-analysis.md) | dsh-cost-meter1.7.28，历史安装副本 | 包结构、来源端点和行为；是上游观察，不是本项目当前契约 |
| [Typert最小契约](typert-rpc-minimal-contract.md) | DSH0.1.5-rc.2 | 当时host/client形状和陷阱；0.2新增工厂要求，见当前平台说明 |
| [仓库审计](repository-audit-2026-10-08.md) | 2026-10-08，3ad9a71 / 0.4.4 | 17项发现、离线复现、安装/类型/测试/构建/打包证据；后续状态移交Backlog |
| [发布与市场规范](repository-release-standards-2026-10.md) | 2026-10-08，官方文档/固定commit | GitHub免费CI、Node/npm/OIDC、DSH及市场规则；末节含文档重构补充与单位勘误 |

最初的本机home/profile路径仅是历史证据，不是本仓库当前工作环境或贡献者配置要求。审计时测试通过与真实账户/视觉覆盖不同；各报告自己的验证范围优先于索引摘要。

## 如何引用

- 官方字段定义优先于社区启发式。Moonshot余额以人民币元计，早期“≥100视为分”的说法已由 [明确勘误](repository-release-standards-2026-10.md#documentation-recheck) 更正；代码仍待A02修复。
- 历史0.1客户端codec形状不含0.2的create要求；link依赖回落、HMR和会话事件结论不能不带版本直接推广。
- 未文档化API可能改变。引用前检查official/unverified标记、固定commit和日期，新增适配器按当前 [指南](../adapters.md) 写容错与真实语义测试。
- 报告中的“当前”、本地路径和行号相对报告基线解释；文档重构后不默默改旧观察，新增纠错放醒目的说明或补充。
- 研究材料只记录ref名、来源和脱敏样本。早期调查曾记录命令输出回显key的事件，该凭据是否已轮换需由持有人确认；这不是本轮重新发现或已执行的操作。

新增研究应注明问题、方法、日期/版本、primary URL或固定commit、验证范围和不确定性，再加入本索引。报告不新增第二份长期待办。
