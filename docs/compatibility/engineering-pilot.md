# 共享工程基座试点

[项目锁文件](../../dsh-engineering.lock.json) 固定基座仓库、分发 tag 和完整提交。项目入口共用这个锁。版本检查先核对显式 checkout 的 `origin` 和完整 tag ref，再读取文档或导出工具。基座工作树停留在维护者自己的分支即可。

## rc.3 升级

上游附注 tag `refs/tags/v0.1.0-rc.3` 解引用为 `5178a049eddcf03778125be1db3ae523621f2fc3`，与本机 Git 对象和项目锁一致。[基座发布说明](https://github.com/takboo/dsh-plugin-engineering/releases/tag/v0.1.0-rc.3)

锁文件继续使用 schema 1。rc.3 增加共享 Tart 实验室的路径解析和只读诊断，路径按显式参数、环境变量、本机配置选取。

容器入口已显式传入基座 checkout，仍由项目验证 origin、tag 和 SHA，再从固定提交导出工具。与 rc.2 相比，容器脚本、Web Dockerfile、fixture 接口和报告字段保持一致。`provenance.producer` 继续核对归档的提交和执行文件摘要，`provenance.inputs` 继续核对候选、精确目标和 Web 探针摘要。

## rc.2 升级与 Web 扩展

- Web 探针适配为 `bf2d102`，锁文件升级单独提交为 `febcdfb`。锁从 `v0.1.0-rc.1` 的 `c816092f91447bd3856a23715c708c42ea18a2b1` 切到 `v0.1.0-rc.2` 的 `964317558a1723b68cb9c2ee692c5cdd4c80534e`。最终探针复用项目原浏览器回归的模型切换，解决首轮直接等待余额行超时。
- 原候选的验证报告绑定旧项目提交 `ad40b109e5fed623beb0fd2de993cd44db69736c`。升级后项目仍要求候选的干净源码提交等于当前 HEAD，因此从最终探针提交 `37dea9a923c586b791790ae993cf05f76881b09c` 重新运行原包门禁。新旧包经 `cmp` 确认逐字节一致，SHA-256 均为 `27ee488e14c4f3fa733570cca38eeebe02e5b4d055cd9c87cbcddf8939becd66`。rc.2 的安装、拒绝和 Web 都使用同一份候选。[候选记录](engineering-pilot/rc2/candidate.json)
- `docs` 入口的六份输出与 rc.2 锁定提交的 Git blob 逐字节一致。`all` 核对执行归档与该提交的五个文件摘要，包含 `Web.Dockerfile`，再核对报告中的实际基座 SHA、候选、目标和 `probeSha256`。[契约摘要](engineering-pilot/rc2/contracts.sha256) · [共享 all 报告](engineering-pilot/rc2/all.json)
- Node 24.22.2 / npm 11.19.1 的完整 `npm run verify` 通过 495 项测试及包门禁。本地预构建 fixture 和同包隔离安装冒烟均通过，后者使用 schemastery 3.18.3。

| 路径 | 精确宿主 | 通过阶段 |
| --- | --- | --- |
| rc.2 共享 CLI | `0.2.1-rc.5` | 安装、配置合成、卸载和卸载后无残留。 |
| rc.2 共享 CLI | `0.2.0-rc.1` | `refused-as-expected`。官方 CLI 正常非零退出，报告保留 `@deepseek-ai/dsh-settings` peer 诊断。基座断言 profile manifest 和 lockfile 逐字节不变，配置合成无候选 bundle。 |
| rc.2 共享 Web | `0.2.1-rc.5` | 在 Linux arm64 容器使用 Chromium `141.0.7390.37`，完成 fixture、浏览器启动、DSH 启动、导航、首启引导和插件断言。切换到 `Compatibility Pro` 后确认 `¥42.25` 位于输入框上方，trace 确认余额请求使用假文件凭据。 |
| rc.1 独立复跑 | `0.2.1-rc.5` / `0.2.0-rc.1` | 允许宿主通过安装、合成和卸载；拒绝宿主的旧 peer 诊断仍使旧基座退出 `1`。独立补验通过，见下文。 |

## rc.1 首轮验收记录（2026-11-10）

- 从干净项目提交 `ad40b109e5fed623beb0fd2de993cd44db69736c` 构建并打包 `dsh-usage-state@0.4.15`。SHA-256 为 `27ee488e14c4f3fa733570cca38eeebe02e5b4d055cd9c87cbcddf8939becd66`。初选对照改正后，重新核对了干净提交与候选，包字节与初测逐字节一致。[打包记录](engineering-pilot/candidate.json)
- 用 `v0.1.0-rc.1` 的完整 tag ref 解引用到 `c816092f91447bd3856a23715c708c42ea18a2b1`。六份文档通过项目 `docs` 入口逐字节比对同一提交的 `git show` 输出。项目 `cli` 入口在执行前把 `git archive` 中的四个执行文件逐一与同提交 blob 比对，收集后再核对 `provenance.producer.commit`、四个摘要、精确目标文件和同包摘要。[文档 SHA-256](engineering-pilot/contracts.sha256) · [基座原始 CLI 报告及执行文件 SHA-256](engineering-pilot/cli.json)
- 在独立临时 checkout 把完整 tag ref 指向另一个提交，项目 CLI 对同一个候选退出 `1`。Git trace 未进入 `git archive`，没有生成容器报告。回归另覆盖 SSH origin、错误 origin、附注 tag、同名分支和变化后的基座工作树。
- 项目用 Node 24.22.2 与 npm 11.19.1 完成 `npm run verify`，共 494 项测试、三个提交内 bundle 一致性和 13 文件的包白名单均通过。`smoke:runtime` 的预构建 fixture 和同一份 tarball 使用 schemastery 3.18.3 的隔离安装均通过。执行时显式把项目工具链放到 PATH 首位并使用临时 npm cache。

两个容器使用基座报告记录的同一镜像摘要，在 Linux arm64、Node 24.22.2、pnpm 11.28.5 下运行同一份候选包。宿主包在安装前核对 SHA-512，CLI 回读精确版本。

| 路径 | 精确宿主 | 观察与结果 |
| --- | --- | --- |
| 锁定基座 CLI | `0.2.1-rc.5` | 官方安装通过，`--dump-config` 包含插件，卸载后依赖和合成配置均无残留。 |
| 锁定基座 CLI | `0.2.0-rc.1` | 官方 CLI 以旧 peer 诊断拒绝。基座要求 `engines.dsh` 诊断，报告原样保留 `admission: failed`，共享 CLI 退出 `1`。 |
| 项目同镜像补验 | `0.2.0-rc.1` | 官方 CLI 退出 `1`，明确指出 `@deepseek-ai/dsh-settings` 不兼容。profile manifest 与 lockfile 逐字节相同，配置合成无候选 bundle。[补验报告](engineering-pilot/peer-refusal.json) |
| 共享 Web | `0.2.1-rc.5` | 待基座提供受控的宿主启动前 fixture 接口，见下文。 |

## 复跑当前锁定版本

在拥有基座 Git 只读权限的环境中准备现有 checkout。在候选源码提交的干净工作树用项目固定 Node/npm 运行下列命令。缺少项目依赖时先运行 `npm ci`。需要 Docker Linux 引擎和容器内 npm registry 访问。若复跑历史报告，先在独立检出定位报告里的项目 `sourceCommit`。

```sh
base_checkout=/path/to/dsh-plugin-engineering
base_tag=$(node -p 'require("./dsh-engineering.lock.json").tag')
# 核对 origin 与锁文件指向同一 GitHub 仓库。
git -C "$base_checkout" remote get-url origin
# 初次缺少 tag 时，从已核对的 origin 获取。
if ! git -C "$base_checkout" show-ref --verify --quiet "refs/tags/$base_tag"; then
  git -C "$base_checkout" fetch --no-tags --no-write-fetch-head origin "refs/tags/$base_tag:refs/tags/$base_tag"
fi
node scripts/verify-engineering.mjs docs "$base_checkout" .agents/skills/dsh-plugin-onboarding/SKILL.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/base-versions.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/engineering-contract.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/plugin-onboarding.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/test-environments.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/distribution.md

npm run verify
npm run smoke:runtime
# 使用 npm run verify 输出的 tarball 路径。
tarball=/path/from/verify/dsh-usage-state-VERSION.tgz
candidate_dir=$(dirname "$tarball")
npm run smoke:runtime -- --tarball "$tarball" --schema-version 3.18.3
node scripts/verify-engineering.mjs all "$base_checkout" "$tarball" "$candidate_dir/engineering-all.json"
```

复用已有候选时保留同目录的 `verification.json` 与 `.sha256` 文件，直接运行最后一条并选用新的报告路径。入口将 `verification.json` 中的干净源码提交与当前 HEAD 核对，使用现有包门禁复验字节，校验报告记录的实际基座提交、执行文件摘要和容器输入摘要。只复跑 CLI 时将 `all` 换成 `cli`。旧发布与兼容性巡检继续走各自的 [发布流程](../release.md) 和 [监测流程](../compatibility-monitor.md)。

[精确目标](../../scripts/compatibility/engineering-targets.json) 的允许对照为 `0.2.1-rc.5`，复用项目已有的隔离 Web 安装证据和 npm integrity。拒绝对照为紧邻项目既有下界 `0.2.0-rc.2` 的 `0.2.0-rc.1`，其精确 integrity 来自 npm registry，源码提交由官方 tag 固定。`0.2.2-rc.1` 启用了 `includePrerelease`，落在当前候选的 caret 范围内。[rc.5 项目证据](0.2.1-rc.5.md) · [项目历史下界](../archive/platform-compatibility-2026-10-17.md#dsh-021-compatibility) · [0.2.0-rc.1 官方 tag](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1) · [0.2.2-rc.1 兼容规则](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/boot/app-boot/src/plugin-compatibility.ts#L45-L64)

## 独立检出复跑 rc.1

独立检出使用旧项目提交的锁和原候选包，保留原 `verification.json` 与 `.sha256`。`docs` 读取 rc.1，CLI 报告的实际生产者也仍为 rc.1。旧基座缺少 Web 宿主启动前 fixture 接口，并要求拒绝诊断包含 `engines.dsh`。本次复跑保留共享 CLI 的非零退出，并用旧项目入口复核 `0.2.0-rc.1` 正常退出 `1`、profile 未改变、合成无残留。[rc.1 复跑报告（诊断已裁剪）](engineering-pilot/rc2/rc1-replay.json) · [rc.1 补验报告](engineering-pilot/rc2/rc1-peer-replay.json) · [旧宿主兼容规则](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/boot/app-boot/src/plugin-compatibility.ts)

```sh
tarball=/path/to/original/dsh-usage-state-0.4.15.tgz
rollback_dir=$(mktemp -d /tmp/dsh-usage-state-rc1-replay.XXXXXX)
git clone --shared --no-checkout -- . "$rollback_dir/project"
git -C "$rollback_dir/project" switch --detach ad40b109e5fed623beb0fd2de993cd44db69736c
cd "$rollback_dir/project"
node scripts/verify-engineering.mjs docs "$base_checkout" docs/test-environments.md
cli_report="$rollback_dir/engineering-cli.json"
node scripts/verify-engineering.mjs cli "$base_checkout" "$tarball" "$cli_report" || test "$?" -eq 1
image=$(node -p 'require(process.argv[1]).image' "$cli_report")
docker run --init --rm --cap-drop=ALL --security-opt=no-new-privileges \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$cli_report,dst=/inputs/cli.json,readonly" \
  --mount "type=bind,src=$tarball,dst=/inputs/plugin.tgz,readonly" \
  --mount "type=bind,src=$PWD/scripts/compatibility/engineering-peer-refusal.mjs,dst=/inputs/probe.mjs,readonly" \
  "$image" node /inputs/probe.mjs /inputs/cli.json /inputs/plugin.tgz
```

共享 Web 证据限于上述 Chromium 场景和合成数据。独立检出复跑验证了历史锁可以继续解析和执行，当时的项目分支锁定 rc.2。
