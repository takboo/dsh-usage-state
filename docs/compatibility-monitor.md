# DSH 版本监测与快速检查

`Monitor DSH releases` 保留 discover → check → report，每小时第 **17 分钟**执行。发现源为官方 `deepseek-ai/deepseek-harness` GitHub Releases（所有规范 SemVer 正式版和预发布版，排除 draft），以及 npm 官方 `@deepseek-ai/dsh` 的 `latest` / `next`。npm 先发布而 GitHub Release 尚未出现时可以检查。基线为 2026-10-23 15:26:39 UTC；按发布时间发现后续发布，GitHub 旧分支新维护版仍可检查，每轮最多处理 10 个版本。npm 渠道倒退到曾观察的较高版本以下，不会安排新的自动降级检查；已固定版本的有界重试和手动精确版本复验仍可进行。

发现时固定精确版本、来源渠道、各渠道发布时间、npm tarball 地址和 SHA-512 integrity。源码提交优先记录 npm `gitHead`，同时尝试解析官方精确 `dsh-v版本` tag；未取得时明确记为 unavailable，不能声称已验证某个源码提交。下载后的包先核验 integrity，再检查包名和版本；后续渠道或包元数据变化不会替换已有 integrity、包地址和已知源码基线。GitHub 已发布但 npm 包尚不可用时为未完成，进入基础设施重试。仅允许官方固定包名与受限版本范围作为直接安装目标；工具固定为 pnpm 11.28.5、Playwright 1.62.1，插件来自本仓库构建 tarball。官方包正常的传递依赖仍由 npm 解析并记录。

每个精确版本对应一个本仓库 `github-actions[bot]` Issue，包含关闭的 Issue；旧 release ID 标记会迁移到同一版本，保留已有结果、插件源码基线和运行链接。多个 npm 标签和 GitHub 渠道汇合时只更新原 Issue 的来源元数据，保留原检查目标、检查时间、次数及结果，**不把渠道更新写成一次新验证**。报告 job 写入前重新查询机器人 Issue，不信任 matrix 提供的 Issue 编号。旧 `partial` 记录迁移为未完成，需要手动精确版本复验；不会改写为通过。普通用户或 PR 中的同形标记不会用于去重。不要编辑机器人标记；其持久状态也承担去重和 npm 渠道高水位记录，删除 Issue 会丢失该状态。

结果和重试规则：

- `passed`：仓库基线、精确版本契约和隔离 Web 浏览器检查均完成，且有实际安装版本证据。仅基线通过不算新版通过。
- `failed / baseline_failure`：仓库自身基线完成但失败，不能直接归因上游不兼容。
- `failed / incompatible`：精确版本的契约或浏览器断言完成但失败，需人工分析。
- `incomplete / infrastructure`：网络、下载、安装、宿主准备、进程超时/无法启动/被信号终止、报告缺失/不匹配/损坏等未完成情况。先写未完成报告，结束后才写最终状态；报告 job 不接受缺少必要阶段和依赖证据的 passed。

自动执行跳过完成的通过和失败结果。基础设施故障以 **上次实际检查时间**为准，至少间隔六小时，最多 **三次自动执行（含首次）**；渠道汇合不会重置间隔或预算。达到上限后保留未完成状态。已固定版本即使不再位于 latest/next，也可进行剩余的基础设施重试。手动输入精确版本或 tag 可绕过去重重验，不消耗或重置自动执行预算。若阶段同时有真实失败和未完成，结果仍为未完成，保留阶段失败证据并受三次上限约束。

每个版本的每次执行都创建新的临时安装目录、HOME、DSH_HOME、缓存、浏览器目录和 fixture；拒绝复用非空 Web 根目录。安装一律禁用脚本，包括 DSH 内部调用的 pnpm；子进程环境不继承真实账户、API key、GitHub token 或用户 npm 配置。检查使用固定 tarball、对应真实 Typert loader/registry 和 manifest 内的 Cordis/schemastery 范围；报告记录解析后的平台和宿主依赖版本/integrity，另保存 profile lock 解析证据。依赖范围解析仍可能随 registry 的新传递依赖变化，不能把该报告理解为整棵依赖树永久可重现。

检查随后运行 `npm run verify`、精确版本契约测试，再在隔离 profile 中安装本仓库 tarball，启动 Web，以模拟数据验证浏览器组件、真实 Host RPC、模型切换、状态行和隐藏/API模式往返。fixture 使用不同的假环境/文件凭据，检查宿主选择假文件凭据。Node fetch 拦截不是所有网络 API 的硬隔离。

Artifact 保留 **14 天**，按白名单只上传 JSON 报告/依赖清单、必要 `.log` 和失败截图；不上传依赖目录、浏览器、profile、真实用户数据或 fixture 工作区。Issue 持久保存摘要、上游/插件源码基线、关键实际依赖版本和原检查运行链接；Artifact 过期后仍可追溯结论。渠道更新不会覆写原检查链接。

**自动检查通过不自动扩大支持声明。** 真实 Desktop 账号、厂商余额、凭据实际保存、模型推理和完整视觉验收仍未覆盖；调整支持范围前按 [发布与验收](release.md#功能与宿主验收) 验证。监测不使用付费 AI、不运行 Agent、不自动合并、打 tag 或发布。

检查 job 仅有 `contents: read`，无 Issue 写权限或持久 Git 凭据；上游 tag、说明、依赖元数据均作为数据，不拼接 shell 命令。报告 job 单独拥有 `issues: write`，只执行本仓库报告脚本并验证报告，不安装上游依赖或执行报告内容。Release 说明不送入模型，也不作为操作指令。

## 通过结果与 Draft PR

监测流程为 discover → check → report → draft-pr。独立的 `draft-pr` job 重新读取本仓库机器人 Issue，包括关闭的 Issue；只接受完整的精确版本 `passed` 证据，并核对原运行的插件提交、工作流、对应版本检查 job 及实际执行成功的检查步骤。旧版 legacy/partial、失败和未完成结果不会创建 PR。当前运行刚完成 check/report 时也可创建草稿，不必等待包含 writer 自身的整个 run 结束。

定时执行会补查尚缺草稿的历史通过结果，即使本轮 discover 无新版本。手动精确版本执行只处理该版本。每个版本使用固定分支 `codex/dsh-compat-版本`，创建一个机器人 Draft PR，写入 `docs/compatibility/版本.md` 以及 `.github/dsh-compatibility.json` 的精确回归候选；常规 CI 从该 JSON 读取矩阵。自动分支不修改 workflow 文件，不运行上游代码，也不修改插件版本、README 支持声明或发布状态。

证据文档保留实际检查时间、插件提交、固定包 integrity、原 Issue/Actions 链接、阶段和依赖版本。后续发现的源码元数据与检查时已知的源码基线分别记录；已有通过结果不会被描述为当前 PR 已通过。候选的 CI 仍需单独完成。真实 Desktop 与账号验收边界继续适用。

重复执行复用原 PR；仅更新仍由机器人管理的草稿分支，ref 更新不使用 force。关闭、合并或转为 ready-for-review 后停止自动更新，不重新创建；人工提交、人工同名 PR/分支不会被覆盖。分支写入成功而 PR API 返回失败/未知时，后续执行可核对机器人提交来源后恢复。人工控制或冲突需要维护者处理，不会自动重开、合并、批准 review、打 tag 或发布。

writer 使用 `contents: write`、`pull-requests: write`、`issues: read`、`actions: read`；check 继续保持只读。仓库 Actions 设置需允许 GitHub Actions 创建 PR，默认 token 权限仍可保持只读。这个 GitHub 设置同时包含 approve 能力，但本工作流不调用审批或合并接口。GitHub 使用 `GITHUB_TOKEN` 创建的 PR 检查可能等待 workflow approval；通过 GitHub 的 Approve workflows to run 或手动派发 CI 验证对应分支，保留实际运行记录。

补建已有通过版本时，在 Actions → Monitor DSH releases → Run workflow 选择 `mode=draft-pr`，`tag=0.2.1-rc.5`。此模式跳过 discover/check/report，只读取已保存证据并创建或更新 PR，不消耗检查重试预算。`pr_base` 默认使用仓库默认分支；验证尚未合并的矩阵读取功能时，可明确选择对应功能分支作为 review base，生成依赖该功能分支的草稿。常态定时触发只在功能进入默认分支后生效。

## 启用与手动复验

工作流必须位于默认分支，仓库启用 Actions、Issues，允许所用 actions，并允许报告 job 请求 `issues: write`；仓库默认 token 权限为只读可以保留，由 job 显式申请写权限。定时触发使用 UTC 的每小时第 17 分钟，可能延迟；公开仓库长期不活动时可能被 GitHub 禁用。网络需能访问 GitHub API、npm registry、Playwright 浏览器及其系统依赖源。Artifact 策略需允许 14 天。

Actions → **Monitor DSH releases** → Run workflow，输入例如 `0.2.1-rc.4` 或 `dsh-v0.2.1-rc.3`。只接受官方已发布精确版本；不接受 `next`、范围、URL 或命令。发现服务失败会使 discover 失败且不产生“通过”。check 失败或报告缺失时，report 尽可能保存未完成 Issue；若整个 workflow 被取消或报告 API 自身失败，报告 job 可能不能执行，此时 Actions run 的 cancelled/failed 是未完成证据，需要人工重跑，不能视为通过。本地验证或尚未推送的工作区修改不表示线上流程已更新。

## 本地复现宿主启动检查

使用规范 Node/npm，在仓库根目录运行：

```sh
export DSH_VERSION=0.2.1-rc.3
export DSH_WEB_ROOT="$(mktemp -d /tmp/dsh-web-check.XXXXXX)"
export DSH_REPORT_DIR="$(mktemp -d /tmp/dsh-web-report.XXXXXX)"
node scripts/compatibility/web-smoke.mjs
```

脚本会安装对应版本 DSH、固定 pnpm 和 Playwright，打包当前插件，创建隔离 profile，安装 tarball，验证启动 URL 的 cookie 交换、Web HTML、浏览器组件、RPC、模型切换、余额显示和隐藏/API配置往返。环境只包含临时 HOME、DSH_HOME、Documents 工作区和假 API key；不继承实际账号环境或当前目录的 `.env`。不得将 `DSH_WEB_ROOT` 指向真实用户目录；脚本拒绝使用非空的 `DSH_WEB_ROOT`。输出目录的 `web-host.log` 可排查安装问题。测试使用宿主文件与环境中不同的假凭据，断言宿主选择文件凭据。Linux 首次运行还会安装 Chromium 所需系统依赖；可用 `DSH_BROWSER_EXECUTABLE` 指定本机浏览器供本地排查，CI 使用 Playwright 固定的 Chromium。
