# 仓库发布与市场规范研究（2026-10）

研究日期：2026-10-08（本次运行环境时间）。对象：`dsh-usage-state@0.4.4`。
本文只记录外部规范、官方实现和发布差距，不修改实现，也不代替功能审计。
结论分为 **硬性要求**、**官方建议**、**本仓库建议**；建议不等于 npm 或市场收录门槛。
滚动文档和市场 `main` 会变化；DSH 与市场关键源码引用固定 commit。

## 1. 仓库现状

| 项目 | 本次观察 | 证据 |
|---|---|---|
| GitHub | public，未 archived，topics 含 `dsh-plugin` | [仓库 API](https://api.github.com/repos/takboo/dsh-usage-state) |
| 仓库年龄 | 创建于 2026-09-20，超过 1 天 | 同上 |
| Actions | 工作流数量为 0 | [Actions API](https://api.github.com/repos/takboo/dsh-usage-state/actions/workflows)；主审计本轮结果 |
| 合并保护 | `main` 返回 `404 Branch not protected`，rulesets 为空 | [保护 API](https://api.github.com/repos/takboo/dsh-usage-state/branches/main/protection)、[rulesets API](https://api.github.com/repos/takboo/dsh-usage-state/rulesets)；主审计本轮结果 |
| Git 发版引用 | tags、GitHub Releases 均为空 | [tags API](https://api.github.com/repos/takboo/dsh-usage-state/tags)、[Releases API](https://api.github.com/repos/takboo/dsh-usage-state/releases)；主审计本轮结果 |
| npm latest | 0.4.4，`gitHead=3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb` | [registry latest](https://registry.npmjs.org/dsh-usage-state/latest) |
| 兼容声明 | Node `>=20`；DSH `>=0.2.0-rc.2 <0.3.0-0` | [包清单](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package.json#L7) |
| npm 元数据 | repository、homepage、bugs、MIT、files、exports 已声明 | [包清单](../../package.json) |
| 市场截图 | 声明 3 张相对路径截图 | [截图清单](../../screenshots.json) |
| 市场描述 | 仍写 `under the composer`／输入框统计行下方 | [官方条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/takboo__dsh-usage-state.yml) |
| 描述更正 | PR #6622 已提交，本次主审计读取为 open、未合并 | [PR #6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622) |

API 观察只代表本次快照；缺 CI、保护或标签不构成市场硬性违规。
latest 的 `dist` 有 registry signatures，未出现 attestations 字段。
Registry signature 不等于构建 provenance；这次观察不能证明所有历史版本都没有 provenance。

## 2. GitHub 免费公开仓库 CI/CD

### 免费范围

**官方规则**：公开仓库使用标准 GitHub-hosted runners 的 Actions 运行免费。
不是只有每月 2,000 分钟；该数字是 GitHub Free 的计划额度，不能套作公开标准 runner 的分钟上限。
Larger runners 即使用于公开仓库也收费。
来源：[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。

免费运行不表示没有并发、运行时长、缓存或保留期限制，也不表示无限存储免费。
计费文档单独讨论 artifact／Packages 共享存储与每仓库 cache allowance。
不能把标准 runner 免费扩写成所有相关产品都无限免费。同一来源。

**官方规则**：日志、artifacts 默认保留 90 天，公开仓库可配置 1–90 天。
组织／企业的最大设置可能进一步限制仓库。
来源：[下载与默认保留](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)、[保留期限](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)。

**本仓库建议**：CI tarball 和失败证据保留 7–14 天；正式 tarball 附到 GitHub Release，并保留 npm 版本。
Actions artifact 有自动到期机制，不应成为正式版本的唯一长期安装地址。

### 权限与合并门槛

**官方建议**：普通验证的 `GITHUB_TOKEN` 使用最小权限，通常是 `contents: read`。
发布 npm 的 job 单独增加 `id-token: write`；创建 GitHub Release 的 job 才增加所需写权限。
第三方 actions 固定完整 commit SHA，并定期更新；可用 Dependabot 维护 SHA 和同一行的版本注释。
来源：[Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)。

同一官方文档警告：有写权限／secrets 的 `pull_request_target`、`workflow_run` 不应执行不可信 PR 代码。
**本仓库建议**：PR 用 `pull_request` 跑离线验证，发布仅处理受控 tag／审定 commit，不给 PR 注入供应商密钥。
这些是适用于新增 CI 的建议，不代表当前仓库已经有此类危险 workflow。

**官方能力**：分支保护可以要求检查通过后合并。
**本仓库建议**：先建立稳定且唯一的 CI job 名，再设置 required checks；单人项目不必机械要求第二位维护者。
来源：[About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。

### 建议的最小验证链路

以下是审计建议，不是 GitHub 强制模板：

1. 标准 Ubuntu runner 上用锁文件执行 `npm ci`。
2. 类型检查、构建，检查提交的 `lib/` 与重建结果一致。
3. 跑源码、真实 registry 契约及产物测试。
4. `npm pack --dry-run --json` 校验白名单，生成 tarball。
5. 从 tarball 隔离安装并验证宿主激活，避免仓库 devDependencies 导致安装冒烟假绿。
6. 验证 package／lockfile 根版本、CHANGELOG、tag 和 tarball 一致性。

本仓库已有对应脚本与产物测试，可直接迁入 PR／`main` push CI。
证据：[脚本](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package.json#L11)、[产物测试](../../tests/build/bundle.test.ts)、[发布流程](../release.md)。
定期依赖检查补充维护即可，无需先引入大型发版框架。

## 3. Node：运行、开发和发布要求不同

| 用途 | 事实／要求 | 来源 |
|---|---|---|
| 用户运行预构建插件 | 本仓库声明 Node `>=20` | [包清单](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package.json#L7) |
| 原生 `.ts` stripping | 22.6 首次引入，22 线在 22.18 默认启用 | [Node v22.18 文档](https://github.com/nodejs/node/blob/v22.18.0/doc/api/typescript.md) |
| 测试同步 loader hook | `registerHooks()` 首次在 22.15.0／23.5.0 提供 | [Node 官方文档](https://beta.docs.nodejs.org/module/registerHooks#moduleregisterhooksoptions) |
| 当前构建工具 | tsdown 0.22.14 要求 `^22.18.0 || >=24.11.0` | [tsdown 固定版本](https://github.com/rolldown/tsdown/blob/v0.22.14/package.json) |
| npm trusted publishing | npm ≥11.5.1，Node ≥22.14.0 | [npm 官方文档](https://docs.npmjs.com/trusted-publishers/) |

Node 原生 stripping 不做类型检查、不读取完整 TypeScript 项目设置，也不支持 `.tsx`。
来源：[Node TypeScript 文档](https://github.com/nodejs/node/blob/v22.18.0/doc/api/typescript.md)。
用 TypeScript 转译 `.tsx` 的自定义 hook 合理，但该 hook 自身依赖较新的 `registerHooks`。
证据：[测试 hook](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/tests/support/client-render-hook.mjs#L2)。

**已确认差距**：两份 README 的“测试需要 Node ≥22.6”不符合现有入口。
证据：[中文说明](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/README.md#L148)、[英文说明](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/README.en.md#L124)和上述官方版本要求。
主审计已实际确认 Node 22.6 导入 `registerHooks` 失败；本研究不重复测试。

**本仓库建议**：开发基线明确为 22.18+（22 线）或符合工具条件的 24 LTS；主要发布 runner 用 24。
若保留运行期 Node 20，单独验证预构建 `.js`，不在 Node 20 上硬跑开发 `.ts/.tsx` 测试。
是否提升用户下限应依实际 DSH 支持与产品决策，不能只因构建工具升级就改动运行承诺。

Node 官方计划：20 的 EOL 为 2026-04-30；22 为 2027-04-30；24 为 2028-04-30。
来源：[Node Release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)。
这支持选择维护中的 LTS 做主 CI／发布，旧运行兼容作为单独承诺维护。

## 4. npm 包与 trusted publishing

### 包要求与可追溯性

**硬性要求**：公开包需要合法 name 和可被 node-semver 解析的 version；同名同版本不能重复发布。
即使 unpublish，该 name/version 组合也不能重用。
来源：[package.json 官方文档](https://github.com/npm/cli/blob/v11.19.1/docs/lib/content/configuring-npm/package-json.md)、[publish 官方文档](https://github.com/npm/cli/blob/v11.19.1/docs/lib/content/commands/npm-publish.md)。

`files` 控制 tarball 内容，`exports` 控制公开入口；入口必须存在并随包发布。
普通 npm 包不带 package-lock；它服务仓库开发／CI。运行所需第三方依赖放 dependencies。
来源：[package.json 官方文档](https://github.com/npm/cli/blob/v11.19.1/docs/lib/content/configuring-npm/package-json.md)。
本仓库白名单和 zod 运行依赖方向正确；运行型插件缺 `.d.ts` 不是 npm 硬性缺陷。
证据：[包清单](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package.json#L53)、[构建配置](../../tsdown.config.ts)。

**本仓库建议**：发版验证版本、lockfile 根元数据和 CHANGELOG 状态，并产生可追溯 tag。
当前 [CHANGELOG](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/CHANGELOG.md#L7)仍将 0.4.4 写在 Unreleased／待发布，registry latest 却已是 0.4.4。
[锁文件](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package-lock.json#L3)根版本仍为 0.4.1；这是元数据漂移，不能仅凭它断言 `npm ci` 必然失败。

### OIDC 发布要求

**硬性要求（选择此方式时）**：npm CLI ≥11.5.1、Node ≥22.14.0；GitHub 路径用 GitHub-hosted runner。
当前不支持 self-hosted runner；发布 job 必须有 `id-token: write`。
来源：[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/)。

npm 设置中的 owner、repository、workflow filename 必须匹配；filename 含 `.yml/.yaml`，不填完整目录。
绑定 environment 时，名称也需匹配。
当前官方页面还区分 Allowed actions：`npm stage publish` 始终允许，direct `npm publish`／dist-tag 可独立授权。
不能假定创建 publisher 后所有发布命令都自动获准。同一来源。

**官方自动行为**：GitHub Actions／GitLab 的 OIDC trusted publishing，且仓库公开、包公开时自动生成 provenance。
该路径无需再加 `--provenance`；私有仓库和 CircleCI 不满足相同自动 provenance 条件。同一来源。

**本仓库建议**：受控 release workflow 代替“本地 publish＋网页 OTP”作为唯一链路。
它减少长期 npm token 和个人机器状态依赖，但不会省掉包设置、版本检查或质量验证。
本轮未实际配置 npm publisher 或 GitHub 发布设置。

## 5. DSH 官方打包／安装约定

主要来源固定于 DSH commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc`：
[Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/user/develop/basic/publish.md)。

bundle 声明 `dsh.bundle.patch`，patch 插入能解析的包入口。
没有 dsh.bundle 的包可装成普通依赖，但不贡献配置层；仅 dsh.client 不足以成为可启用 bundle。
同一来源；市场另将 dsh.bundle 作为收录硬性门槛。

`dsh plugin --profile ...` 转交 profile 内 pnpm。
需与宿主共享实例的 DSH 包按官方说明声明 peer＋dev；独立第三方与无状态 DSH utilities 用 dependencies。
不能把“所有 @deepseek-ai 包只能是 peer”当作无例外的平台规范。同一来源。

Git 安装源码可通过 prepare 构建，但官方说明 pnpm ≥10 的该构建需用户 allowBuilds。
npm／预构建 tarball 不需要这项构建授权；提交预构建 lib 是本仓库为直接 Git 安装选择的分发策略。
证据：[本仓库说明](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/README.md#L178)与官方发布文档。

npm 自身的 Git URL 规则中，build、prepare、prepack 等脚本可触发临时构建；本仓库已有 build。
不能从 DSH/pnpm 实测外推“所有 npm Git 安装都没构建步骤”。
来源：[npm Git URLs 规则](https://github.com/npm/cli/blob/v11.19.1/docs/lib/content/configuring-npm/package-json.md#git-urls-as-dependencies)。

**本仓库建议**：CI 显式 build/test/pack，验证现有 pnpm Git 与 npm/tarball 路径后再选 lifecycle hooks。
不要未经验证就增加 prepare／prepack，避免让预构建直装路径出现额外构建和授权要求。

固定官方文档对外部 link 的模块查找、peer 回落有详细位置规则，比“link 均无回落”表述细。
[平台实测记录](../platform-notes.md)只代表其标注宿主版本；本轮未复验历史宿主，不能擅自推翻或永久泛化。

## 6. awesome-dsh-plugin／dsh-market

### 收录门槛与推荐项

来源：[官方 contributing](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)。

**硬性要求**：真实可用代码、dsh.bundle、仓库满 1 天、dsh-plugin topic、活跃维护、描述属实。
投稿修改自己的 `data/plugins/<owner>__<repo>.yml`，包含 url/name/category/description.en。
中文描述可选；最多添加 3 条，不夸大功能或数字；生成 README 不是条目数据源。同一来源。

npm 发布、截图为推荐项，不是收录必需。
npm repository 必须指回收录仓库才能自动关联；条目手写 npm 字段会被拒绝。
本仓库 [截图清单](../../screenshots.json)的 1–8 张图片规则：相对路径不得越界，绝对 URL 限 GitHub 托管 HTTPS。
不声明截图可从 README 提取；更新自己截图不需要再次向精选库提 PR。同一来源。

不发 npm 且根本不能从源码安装时，官方要求 GitHub Release HTTPS `.tgz` 和 tarball 声明。
`latest/download/` 后文件名不自动随版本变化；需稳定文件名或固定 tag。同一来源。

本仓库基本清单和截图形式符合要求，但旧“输入框下方”描述与 [现 README](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/README.md#L5)不符。
更正 PR 已存在，无需重复提交；后续重新核对 [PR #6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622)。

### 兼容判定是 AND

主要来源固定于 dsh-market commit `a355401e64c8e86f79e28d5c88ee2403527cfe08`：
[discovery-compatibility 实现](https://github.com/dsh-market/dsh-market/blob/a355401e64c8e86f79e28d5c88ee2403527cfe08/src/discovery-compatibility.ts)。

manifestFacts 读取 engines.dsh 或 dsh.engines.dsh，两者同时存在时顶层胜出。
deriveHostCompatibility 对 engine 和所有相关 host peers **共同判断（AND）**。
任一明确失败为 incompatible，全部通过才 compatible，其余 unknown；不是有 engine 就忽略 peers。同一来源。

只对主机包集合内、匹配 @deepseek-ai/dsh 名称的同步发布线 peer 推算 DSH 版本。
Cordis／schemastery 版本线不同，不参与此推算；peer 隐式 caret／tilde 上限还有方向性及跨发布线规则。
engine 则按声明范围判断。同一来源。

发现页通常查询 latest，命名版本安装／更新可以读目标版本清单；不能全简化成 latest。
findCompatibleVersion 只返回明确 compatible 的候选。同一来源。

**本仓库建议**：[发布文档](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/docs/release.md#L24)将“engine 优先、peer 其次”改为组合判定；
不要未经实际兼容验证将已有声明放宽到 0.3 发布线。

### 日构建时间与可见性

[官方 workflow](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/.github/workflows/build-site.yml)
当前 cron 为 `23 2 * * *`，即 UTC 02:23 触发；另有 push、workflow_run 和手动触发。
npm catalog 发布仅在 schedule／workflow_dispatch 路径执行。
[本仓库发布文档](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/docs/release.md#L26)“每日约 03:30Z”与当前 workflow 不一致。

schedule 可延迟，足够高负载时排队作业也可能丢弃。
来源：[GitHub schedule 规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。
因此“次日一定可搜到”不是可靠承诺；应等待成功构建／catalog 版本实际更新后核对。

## 7. 建议顺序与限制

先建立 PR CI／必需检查，再做版本和产物一致性守卫，随后配置受控 OIDC 发布。
同步开发 Node 下限、CHANGELOG 状态、市场兼容描述和日构建说明。
可直接使用公开标准 runners 免费能力，保留既有测试体系。

本轮未读取私有 npm 设置、GitHub billing 实际账单或真实凭据，不能断言后台 publisher／预算如何配置。
未启动替代 DSH server 或复验历史宿主；宿主细节以标注版本的实测为准。
滚动 npm 文档含 2026 年 staged publishing 增量，实施时重新核对 CLI 和包设置。
市场规则、描述、workflow 时间均为本日快照，正式发版前应复查原始链接。

<a id="documentation-recheck"></a>

## 8. 文档重构补充核验（2026-10-08）

本节服务本轮文档重构；前文保留原审计快照。常青文档重写后，前文引用的行号及“当前欠账”仍指原观察时点，不能把它们当成重写后的状态。

### npm 0.4.4 的正式发布日期

[npm packument](https://registry.npmjs.org/dsh-usage-state) 的 `time["0.4.4"]` 为 **`2026-10-06T02:27:44.181Z`**，因此 CHANGELOG 可按 UTC 记录 **2026-10-06**，不再写“待发布”。
[版本清单](https://registry.npmjs.org/dsh-usage-state/0.4.4) 的 `gitHead` 为 **`3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb`**。
发布日期取版本对应的 time 字段，不取整个包的 modified 时间，也不以本地提交日期替代 registry 发布日期。
这仅核准历史发布事实，不代表文档重构已经另发新版本。

### 市场描述更正仍待合并

[GitHub PR API](https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls/6622) 本轮返回 `state: "open"`、`merged: false`、`merged_at: null`；PR 创建及最后更新于 **2026-10-05T09:57:33Z**。
[官方条目原文](https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/data/plugins/takboo__dsh-usage-state.yml) 仍写 `in one line under the composer`／“在输入框统计行下方一行”。
现有 [PR #6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622) 已提出“输入框上方独立一行”更正，待办应跟踪它，不应记录为已合并或再提交重复 PR。

### GitHub 安装、link 与 HMR 的适用前提

重新读取固定 commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc` 的 [DSH 发布指南](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/user/develop/basic/publish.md)：

- `dsh plugin` 转交 profile 内 pnpm；普通 Git 源的 `build` 不会由该路径自动运行，需要构建时通常依靠 `prepare`，pnpm ≥10 可能要求用户配置 `allowBuilds`。
- 官方明确 npm 的预构建包和预构建 `.tgz` 不需要这项安装构建许可。本仓库 GitHub 直装依赖**仓库提交了入口所需的 `lib/`**；这是本仓库分发策略，不能写成所有 TypeScript GitHub 包都可无构建安装。
- npm 指定版本和 GitHub 浮动分支不是同一不可变来源；若要核对同版，使用已知发布 gitHead／固定 commit，并验证其实际入口文件，不应保证未来 `main` 与 npm latest 内容恒同。
- linked checkout 保留自己的 `node_modules`，共享宿主实例的包按 peer＋dev 声明；实际解析遵循导入目录、物理包及当前 peer 声明的查找规则。**澄清前文第 5 节与历史平台笔记的适用范围：不能把某旧宿主的“link 无回落”实测当成所有版本的普遍规则。**本轮没有复验历史宿主，原实测记录仍保留其日期和版本。

[官方 HMR 文档](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/hmr/README.md) 和 [宿主实现](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/hmr/src/index.ts) 说明：

- Web composition 的 HMR transport 监听**已生成的浏览器 bundle**，默认每 500ms 检查入口 mtime／ctime／size，经 `/plugins/events` 发送 graph／rebuilt；transport 被禁用即停止传递。
- DSH 源码开发的 `pnpm run dev:web` 同时启动宿主和重建 watcher；`--no-serve` 可只启动 watcher，配合已有宿主。只有浏览器接收器而没有 bundle 重建，不会因源文件保存而更新。
- 对外部 link 插件，自己的 watcher 必须重建宿主实际读取的同一份 `lib/client.js`，且当前 Web 宿主和浏览器 HMR 通道须活跃；不能把另一份 checkout 的重建当作当前 GUI 的自动更新。
- 成功热替换会重执行并重挂载受影响插件，插件本地 React 状态会丢失。宿主入口或配置层的改动不属于浏览器 bundle 热替换，应按实际宿主生命周期重新加载／重启；Web shell 的改动也不能靠此插件替换链生效。

[DSH 开发指南](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/development.md#application-commands) 区分 `start:web` 使用已有产物与 `dev:web` 构建并持续重建。
本仓库 [tsdown 配置](../../tsdown.config.ts) 同时包含宿主 index／typert 和客户端两组入口，故“`npm run watch` 只重建 client.js”并非准确的脚本说明；源码 watch 与哪些改动需要宿主重启应分开描述。
这些是规范与源码核验，没有启动 server 或宣称本机 HMR 已现场验证。

### Moonshot 余额单位的明确勘误

[官方查询余额文档及 OpenAPI](https://platform.kimi.com/docs/api/balance.md) 对 `GET https://api.moonshot.cn/v1/users/me/balance` 明确规定：

| 字段 | 官方定义 |
|---|---|
| `data.available_balance` | 可用余额，**人民币元**，包含现金和代金券余额 |
| `data.voucher_balance` | 代金券余额，**人民币元**，不可为负 |
| `data.cash_balance` | 现金余额，**人民币元**，可为负表示欠费 |

**勘误**：早期研究／适配器文档的“分／元无法辨别、≥100 视为分”不符合此官方接口定义；不能按金额数值猜单位。代码当前启发式属于已识别实现缺陷，文档重构应明确其验证状态与修复待办，不能通过改写文档暗示代码已修复。
本轮仅读取官方资料，没有使用真实 Moonshot 密钥或账户。

### Changelog历史发布引用补充

主审计在文档重构时读取同一 [npm packument](https://registry.npmjs.org/dsh-usage-state)，确认以下time/gitHead。比较链接采用这些不可变提交，避免引用本仓库尚不存在的版本tag。

| npm版本 | 发布日期（UTC） | gitHead |
|---|---|---|
| 0.3.0 | 2026-09-22 | 098a31c5b01c600a42ce5bc86d51627ec97b2b16 |
| 0.3.1 | 2026-09-22 | 9f8b863339ebf552478e48c93cc80641f5e2ecb5 |
| 0.3.2 | 2026-09-30 | d9e08c8765ff89b9dc57b8ac56ee4c61412176d6 |
| 0.4.0 | 2026-10-05 | d93e2c7cdbbba76346d753171b2a4c8408793fc2 |
| 0.4.1 | 2026-10-05 | e5ef97375d01faf9073ef5e4c7522f6ff59514f9 |
| 0.4.2 | 2026-10-05 | 0d2d4376d0db990fb36df5d6124e5b7894974d62 |
| 0.4.3 | 2026-10-05 | 885541638ffa4da05b39bd1864085ba6d9acc288 |
| 0.4.4 | 2026-10-06 | 3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb |

本地Git历史中共享dock适配提交f69eb95位于0.4.1发布gitHead之后、0.4.2之前；Changelog不再把这一后续开发调整记成npm0.4.1内容。0.2系列只有可确认的实现提交，首版完整发布点未确认，因此不编造历史tag或tarball证据。
