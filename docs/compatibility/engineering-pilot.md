# 共享工程基座试点

[项目锁文件](../../dsh-engineering.lock.json) 固定基座仓库、分发 tag 和完整提交。项目入口共用这个锁。版本检查先核对显式 checkout 的 `origin` 和完整 tag ref，再读取文档或导出工具。基座工作树停留在维护者自己的分支即可。

## 复跑

在拥有基座 Git 只读权限的环境中准备现有 checkout。在候选源码提交的干净工作树用项目固定 Node/npm 运行下列命令。需要 Docker Linux 引擎和容器内 npm registry 访问。若复跑历史报告，先在独立检出定位报告里的项目 `sourceCommit`。

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

第二个分发版本就绪后，在项目试点分支核对旧、新两个 tag 与完整 SHA，读取各自的固定契约。更新锁文件，按新契约同步必要的入口改动，从升级提交复跑上面的 `docs` 与 `cli`，记录新基座摘要和精确宿主阶段。再在独立检出定位旧项目提交，使用其旧锁文件和保留的旧候选包复跑同一入口，核对旧生产者摘要与阶段。保留两轮报告各自的版本和产物身份。
