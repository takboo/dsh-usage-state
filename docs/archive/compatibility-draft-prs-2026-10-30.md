# 兼容性 Draft PR 审查：2026-10-30

对象为 [#14](https://github.com/takboo/dsh-usage-state/pull/14) 与 [#15](https://github.com/takboo/dsh-usage-state/pull/15)，审查包含自动生成、去重、补建、失败恢复和权限隔离。

## 已修复的问题

- P2：中断恢复要求 author 和 committer 都是 `github-actions[bot]`，但实际生成提交 `a73567083d8496f2ecfff70dfe223d4aa7745cec` 的 REST 元数据是 author=`github-actions[bot]`、committer=`web-flow`，签名验证为 valid。原逻辑会拒绝合法的已写入分支。恢复改为验证 GitHub 签名、作者和精确提交标记。
- P2：原恢复只检查修改的文件名，未确认文件内容。即使分支另有内容，也可能被重新生成的候选替换。恢复现在要求当前 tree 与当前基线和证据产生的目标 tree 完全一致；不一致时停止，保留分支供人工检查。

新增回归先在原代码上复现两个失败，再验证修复通过。另覆盖 PR body 写入中断后的恢复，以及翻页后的历史通过结果和关闭 PR 去重。

## 已核对的边界

- 只从本仓库机器人 Issue 读取完整 passed 证据，并核对精确版本、integrity、原检查提交、运行工作流、对应版本 check job 和实际成功的检查步骤；失败、未完成与 legacy 记录不创建草稿。
- 每个精确版本固定一个分支和 PR；查询包含关闭记录，手动补建复用现有通过结果且不消耗重试预算。人工提交、关闭或转为 ready-for-review 后保留人工控制。
- check job 保持只读且不接收 GitHub token；report 仅写 Issue。独立 draft-pr job 使用 contents/PR write 和 issues/Actions read，不安装或执行上游依赖，不访问发布权限。
- 版本及路径经过校验；自动提交只改精确版本 JSON 和证据文档，不改 workflow、包版本或支持声明，ref 更新不使用 force。
- #15 只加入 rc.5 回归候选和原检查证据；其检查提交、时间和 fixture/真实 Desktop 边界均保留，没有把原通过结果当成新提交的完整验收。

## 原线上证据

- [机器人补建](https://github.com/takboo/dsh-usage-state/actions/runs/40993551886) 创建 #15。
- [重复补建](https://github.com/takboo/dsh-usage-state/actions/runs/40993652111) 返回 unchanged，未新增提交。
- [#15 CI](https://github.com/takboo/dsh-usage-state/actions/runs/40993585346) 包含 rc.5 的精确契约和 Node 20 预构建运行。

上述运行属于修复前基线。修复后的本地与线上 CI 由 #14 当前检查记录标识；正式发布还需验证最终 main/tag 及分发字节。
