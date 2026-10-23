# 发布与验收

此流程对应仓库 [CI](../.github/workflows/ci.yml)、[Release](../.github/workflows/release.yml) 和 [工具链action](../.github/actions/setup-toolchain/action.yml)。版本历史见 [Changelog](../CHANGELOG.md)，未验收范围见 [Backlog](backlog.md)。

## 准备可信提交

1. 获取远端main与tags，保留本地改动后同步最新main；同时查询npm版本，选择未占用的新稳定版本。
2. 更新package版本、lock根/根package版本、双语README及带日期Changelog。保留已发布修复和支持范围；实际日期按npm发布时间UTC记录。
3. 在仓库固定Node/npm上运行 `npm ci`、metadata、typecheck、build、test、package，检查文档链接及 `git diff --check`。
4. 一并提交源码、三个bundle、文档及元数据。提交后运行 `npm run verify`：HEAD产物一致性必须通过。不要通过隐藏bundle差异绕过检查。
5. 推送main，等待该提交的全部CI检查通过后再创建并推送稳定tag `v<package.version>`。

## 自动发布与恢复

稳定tag首次push触发派发job，随后在可信main上运行Release（mode=publish）。tag必须是origin/main祖先，package/lock和带日期Changelog必须一致。手动工作流默认verify；只在明确发布时选publish。

Release在规范Node上验证并只打包一次，生成含sourceCommit、workingTreeDirty=false和SHA-256的报告；同tarball通过Node20隔离运行，才由npm OIDC job发布。独立GitHub写权限job上传同一tarball及checksum。具体action SHA、版本、矩阵和超时直接以工作流为准。

| 失败阶段 | 恢复方法 |
|---|---|
| CI类型/测试/产物 | 修复源码或工具链问题，重建并提交，等待新提交CI通过 |
| tag/版本校验 | 核对祖先、稳定格式、package/lock/Changelog及npm占用情况；已发布版本保持不可变 |
| npm发布前 | 修复后重新验证尚未发布的候选；重试前先查registry是否已经成功 |
| npm成功、GitHub附件失败 | 在Actions产物保留期内只重跑失败附档job，复用原tarball；不再次publish或重新打包 |
| Actions暂时故障 | 确认失败原因后重跑失败job，保持已成功步骤和产物身份 |

GitHub连接器缺少tag/发布调度接口时使用 `git`/`gh` 执行同一工作流。不要把自动tag派发和人工dispatch重复执行。

## 本地最终包复验

在干净、已提交检出中生成一次本地候选包：

```bash
release_dir=$(mktemp -d "${TMPDIR:-/tmp}/dsh-usage-state-release.XXXXXX")
package_version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version")
npm run verify:package -- --out-dir "$release_dir"
tarball="$release_dir/dsh-usage-state-$package_version.tgz"
npm run smoke:runtime -- --tarball "$tarball"
```

复验已有包使用 `--tarball`；不要覆盖同名候选。可用 `--schema-version 3.18.3` 检查真实声明下界。Node20只运行该预构建包，不运行TS/TSX或重建。npm公开发布以Release job产生的字节为准，不假定本地包和云端包相同。

## 发布完成判据

- 目标main提交CI全部成功；稳定tag指向本次发布提交。
- Release验证、同包Node20冒烟、npm publish及GitHub附件job全部成功。
- npm精确版本和latest正确，存在provenance；GitHub Release的tarball/checksum对应同一个版本和提交。
- 下载npm精确版本与GitHub附件，核对SHA-256及包内关键元数据；对正式分发包执行独立安装冒烟。
- 把实际Actions链接、版本、提交、时间和字节校验记录到发布证据；任何追加的文档提交也跟进CI。未做的真实账户/视觉验收留在待办。

## 功能与宿主验收

独立home/profile安装实际tarball，不使用开发link替代。新home仍继承启动环境，fixture验证清理真实账户环境。核对插件配置、Host激活、客户端设置/模型清单及getState/describeCredentials往返；只看到入口不能证明RPC已挂载。

账号模式核对充值/赠送总额、API Key独立身份及签出/换号；其他来源核对官方单位、实际窗口、失败旧值与配置隐藏。真实浏览器还需检查窄屏、中英文、长名和warn/critical。自动化/fake host成功与这些验收分别记录。

## 市场维护

本次npm/GitHub发版不自动表示市场目录已刷新。只有修改收录描述或截图时，核对市场当次规则并修改对应来源条目；跟踪已有PR，不重复投稿。市场cron、兼容判定和旧PR状态不作为本仓库常青事实，历史调查见 [归档](archive/README.md)。
