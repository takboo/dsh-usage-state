# 共享工程基座试点

[项目锁文件](../../dsh-engineering.lock.json) 固定基座仓库、分发 tag 和完整提交。项目入口共用这个锁。版本检查先核对显式 checkout 的 `origin` 和完整 tag ref，再读取文档或导出工具。基座工作树停留在维护者自己的分支即可。

## 2026-11-10 验收记录

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

## 复跑

在拥有基座 Git 只读权限的环境中准备现有 checkout。在候选源码提交的干净工作树用项目固定 Node/npm 运行下列命令。缺少项目依赖时先运行 `npm ci`。需要 Docker Linux 引擎和容器内 npm registry 访问。若复跑历史报告，先在独立检出定位报告里的项目 `sourceCommit`。

```sh
base_checkout=/path/to/dsh-plugin-engineering
base_tag=$(node -p 'require("./dsh-engineering.lock.json").tag')
# 初次缺少 tag 时，从已核对的 origin 获取，不切换分支。
git -C "$base_checkout" remote get-url origin
git -C "$base_checkout" fetch --no-tags --no-write-fetch-head origin "refs/tags/$base_tag:refs/tags/$base_tag"
node scripts/verify-engineering.mjs docs "$base_checkout" .agents/skills/dsh-plugin-onboarding/SKILL.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/base-versions.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/engineering-contract.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/plugin-onboarding.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/test-environments.md
node scripts/verify-engineering.mjs docs "$base_checkout" docs/distribution.md

npm run build
npm run verify:artifacts
candidate_dir=$(mktemp -d /tmp/dsh-usage-state-engineering-candidate.XXXXXX)
version=$(node -p 'require("./package.json").version')
npm run verify:package -- --out-dir "$candidate_dir"
tarball="$candidate_dir/dsh-usage-state-$version.tgz"
node scripts/verify-engineering.mjs cli "$base_checkout" "$tarball" "$candidate_dir/engineering-cli.json"
```

复用已有候选时保留同目录的 `verification.json` 与 `.sha256` 文件，直接运行最后一条并选用新的报告路径。已有 `npm run verify` 也会生成一份候选，直接使用其输出的 tarball 路径。入口将 `verification.json` 中的干净源码提交与当前 HEAD 核对，使用现有包门禁复验字节，校验报告记录的实际基座提交、执行文件摘要和容器输入摘要。旧发布与兼容性巡检继续走各自的 [发布流程](../release.md) 和 [监测流程](../compatibility-monitor.md)。

[精确目标](../../scripts/compatibility/engineering-targets.json) 的允许对照为 `0.2.1-rc.5`，复用项目已有的隔离 Web 安装证据和 npm integrity。拒绝对照为紧邻项目既有下界 `0.2.0-rc.2` 的 `0.2.0-rc.1`，其精确 integrity 来自 npm registry，源码提交由官方 tag 固定。`0.2.2-rc.1` 启用了 `includePrerelease`，落在当前候选的 caret 范围内。[rc.5 项目证据](0.2.1-rc.5.md) · [项目历史下界](../archive/platform-compatibility-2026-10-17.md#dsh-021-compatibility) · [0.2.0-rc.1 官方 tag](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1) · [0.2.2-rc.1 兼容规则](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/boot/app-boot/src/plugin-compatibility.ts#L45-L64)

### 旧宿主拒绝复核

`0.2.0-rc.1` 的官方 CLI 通过 `peerDependencies` 报告拒绝，当前基座要求诊断包含 `engines.dsh`，因此共享入口会保留原始报告和非零退出。用刚生成的可信报告取同一个固定 Linux 镜像，在独立容器中核对候选字节、官方 CLI 非零退出、拒绝原因、profile manifest 与 lockfile 原样，以及拒绝后配置合成无残留。[旧宿主兼容规则](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/boot/app-boot/src/plugin-compatibility.ts)

```sh
cli_report="$candidate_dir/engineering-cli.json"
image=$(node -p 'require(process.argv[1]).image' "$cli_report")
docker run --init --rm --cap-drop=ALL --security-opt=no-new-privileges \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$cli_report,dst=/inputs/cli.json,readonly" \
  --mount "type=bind,src=$tarball,dst=/inputs/plugin.tgz,readonly" \
  --mount "type=bind,src=$PWD/scripts/compatibility/engineering-peer-refusal.mjs,dst=/inputs/probe.mjs,readonly" \
  "$image" node /inputs/probe.mjs /inputs/cli.json /inputs/plugin.tgz
```

## Web 缺口

本轮共享入口只跑 CLI。当前锁定版本的 `scripts/verify-host.mjs` 在 `inspectPage()` 中先用固定启动参数和环境启动 DSH，再调用 `prepareClient(page)` 和 `verifyClient(page)`。它没有受控的宿主启动前 fixture 接口。项目现有 Web 路径依赖在启动前设置 workspace overlay、假文件凭据、不同的假环境凭据和 `NODE_OPTIONS` 的 fetch fixture。浏览器探针阶段无法保证已启动宿主的模型和余额请求使用这些假数据。[项目宿主启动](../../scripts/compatibility/web-smoke.mjs) · [假数据与凭据断言](../../scripts/compatibility/fetch-fixture.mjs)

基座提供受控的启动前接口后，按新版本契约把同一份 CLI 候选包交给共享 Web，复用 [浏览器验收](../../scripts/compatibility/browser-acceptance.mjs) 中 `getState` 返回 CNY 42.25 的断言，并核对 fixture trace 的 `balance` 请求使用假文件凭据。当前项目 Web 巡检仍按原入口运行，生成自己的包。

## 升级和回滚待验收

第二个分发版本就绪后，在项目试点分支核对旧、新两个 tag 与完整 SHA，读取各自的固定契约。更新锁文件，按新契约同步必要的入口改动，从升级提交复跑上面的 `docs` 与 `cli`，记录新基座摘要和精确宿主阶段。再在独立检出定位旧项目提交，使用其旧锁文件和保留的旧候选包复跑同一入口，核对旧生产者摘要、原始阶段与项目补验。保留两轮报告各自的版本和产物身份。
