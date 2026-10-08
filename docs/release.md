# 发布与验收

本文件是维护流程。已发布的事实放 [更新日志](../CHANGELOG.md)，未完成自动化见 [Backlog](backlog.md#a11)，外部要求与固定源码依据见 [规范研究](research/repository-release-standards-2026-10.md)。当前没有CI/OIDC发布工作流；下文要求由发布者执行，不表示已自动配置。

## 1. 版本和支持范围

- 本次版本、package/lock根元数据、正式Changelog条目、已验证产物、Git引用应来自同一发布提交。版本不可重用。
- Changelog日期采用npm实际发布时间的UTC日期；Unreleased只记录尚未发版的变更。0.4.4已于2026-10-06发布，不能继续标待发布。
- 当前DSH范围是 `>=0.2.0-rc.2 <0.3.0-0`，运行Node声明≥20。开发使用Node22.18+的22线或24.11+；发布建议符合条件的Node24及npm≥11.5.1。
- 平台依赖的锁定基线与所声明下界必须实际复验；结构类型镜像/编译相同不能证明最低宿主兼容。新DSH发布线先验再扩大范围。
- 维护者应给今后版本创建一致的tag（例如v<version>）及GitHub Release；历史没有tag时，Changelog使用有依据的commit，不补造发布点。

目前锁文件仍有0.4.1根版本，client产物与源码有已知文案差异，跟踪A12/A13。本轮文档整理没有修复它们；正式发版门禁可能因此失败，应在对应提交中处理而不是绕过检查。

## 2. 构建、最终产物与打包

在仓库根目录、正确开发Node版本执行：

```bash
npm ci
npm run typecheck
npm run build
npm test

git diff --exit-code -- lib
test -z "$(git ls-files --others --exclude-standard -- lib)"
npm pack --dry-run --json
```

`npm test`当前缺必要产物时会skip，所以还需确认index/client/Typert、所有exports和patch确实存在，且测试无skip。构建先于产物测试；源码测试通过不能证明已提交产物一致。缺入口和额外未跟踪生成文件都应失败。

发布白名单以 [package清单](../package.json) 为准，现有10文件为：三个预构建入口、patch、两个README、许可、Changelog、适配器指南和package清单本身。检查包内不含源码、测试、凭据、临时日志；未随包文档通过GitHub链接导航。

生成正式tarball，在同一终端保留路径变量：

```bash
release_dir=$(mktemp -d "${TMPDIR:-/tmp}/dsh-usage-state-release.XXXXXX")
package_version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version")
npm pack --pack-destination "$release_dir"
tarball="$release_dir/dsh-usage-state-$package_version.tgz"
test -f "$tarball"
tar -tf "$tarball"
```

只有改变依赖时用npm install，复现验证用npm ci。缓存目录不可写可加自选cache路径，不把作者本机权限workaround变成通用步骤。

## 3. 隔离安装冒烟

使用支持范围内的DSH CLI及新的临时home，安装上一步**实际tarball**。不要用工作树link替代发布测试：它能访问开发依赖，可能掩盖正式安装解析问题。link回落规则有版本/路径条件，见 [平台说明](platform-notes.md#module-resolution)。

```bash
verify_home=$(mktemp -d "${TMPDIR:-/tmp}/dsh-usage-state-verify.XXXXXX")
dsh_bin=$(command -v dsh)
# 若CLI不在PATH，改为已有CLI的绝对路径；不要临时安装不明版本
DSH_HOME="$verify_home" "$dsh_bin" --profile smoke --from-default-profile web --dump-config
DSH_HOME="$verify_home" "$dsh_bin" plugin --profile smoke add "$tarball"
DSH_HOME="$verify_home" "$dsh_bin" --profile smoke --dump-config
DSH_HOME="$verify_home" "$dsh_bin" --profile smoke --port 3081 --no-open
```

创建profile的CLI若保持运行，输出后退出该进程再执行下一步。端口需空闲，最后一步以前台运行，便于检查启动状态并Ctrl-C停止。新home不隔离继承的环境key；无账户验证需求时使用不含真实key的测试进程。不要把DSH_HOME指向真实profile所在home。

通过判据必须同时包含：

| 层 | 需要确认 |
|---|---|
| 配置 | usage-state条目、config:{}或本次测试配置、bundle来源是该tarball |
| 宿主 | 进程正常完成启动；无本插件pending/failed/entry did not activate，不仅是“日志没grep到告警” |
| 浏览器装配 | 客户端入口可加载，依赖服务满足，设置页能打开；不是只看到__DSH_BOOT__入口 |
| RPC | 贡献已挂载，usageState/getState与describeCredentials可解析；返回source目录/缺key状态，不需要虚构0读数 |
| 产物契约 | [源码贡献](../tests/client/contribution.test.ts)及 [bundle测试](../tests/build/bundle.test.ts) 都使用真实registry；必要时用 [browser-face helper](../tests/support/browser-face.mjs) 对宿主实际提供的client产物做同一验证 |

在声明的最低DSH和当前受支持DSH上复验。真实宿主启动、客户端挂载和RPC往返是不同证据，任一失败都不能记“兼容通过”。本轮文档重构未执行此真机冒烟。

## 4. 功能及人工验收

记录本次commit/插件版本、Node、DSH、安装形态、测试源和日期。没有凭据或环境不适用时标“未验证”，不要把历史截图沿用为本次验收。

| 操作 | 验收要求 |
|---|---|
| 打开设置和切换语言 | 页面/词典有效，provider与模型目录一致 |
| 选择模型与模式/隐藏 | 输入框上方独立行；原生统计保留；隐藏不继续轮询（legacy案例亦要测） |
| 指定ref/端点 | 实际请求与凭据描述一致；明确pin不镜像；切配置不返回旧身份有效值 |
| 请求失败和RPC断线 | 保留旧值并准确标陈旧/年龄/原因；非法金额不能覆盖为0 |
| 金额及窗口 | 对官方单位和响应字段；Moonshot100元仍是100元；Sub2API按真实窗口 |
| 排序和显示配置 | 默认provider也可排序；阈值、环、刷新策略按各自约定生效 |
| 异步写key和只读状态 | 保存/清除结果有反馈，无环境遮蔽时写入后确实生效 |
| 视觉 | 长名、窄屏、中文/英文、正常/warn/critical与所用字体 |

这些包含当前已知失败项，具体状态见A01–A10/A16。若本次只发布文档，注明未修项；若声称修复某项，应完成其验收而不是只改说明。

## 5. 发布并核对版本

发布已验证的tarball，不在发布阶段另打一个可能不同的包。

推荐后续采用npm trusted publishing，绑定owner/repository/workflow filename，按所选direct/staged策略配置allowed actions。GitHub-hosted runner、npm≥11.5.1、Node≥22.14及job的id-token:write为该方式要求；公开repo+公开包路径自动provenance。配置来源见 [官方npm文档](https://docs.npmjs.com/trusted-publishers/)；此方式尚未在本仓库落地。

当前人工方式依npm包的权限和2FA策略完成认证：

```bash
npm publish "$tarball"
npm view "dsh-usage-state@$package_version" version engines repository gitHead dist --json
```

认证、OTP或网页确认按npm当次返回处理，不把某次EOTP步骤写成所有环境共同流程。核对registry目标版本而不只查询latest；刚发布版本是否可装还受所用pnpm年龄策略、镜像和缓存影响，明确版本后仍需读取结果判断，不能承诺指定版本一定绕过所有年龄限制。

提交与tag指向已验证发布点；把同一tarball及校验值附到GitHub Release，检查GitHub固定引用和npm安装。没有tag/release的历史版本以已确认gitHead追溯；本次不代替维护者创建远端版本。

## 6. GitHub自动化建议

标准公开GitHub-hosted runner运行免费；larger runner另计费。PR/main应跑锁文件安装、类型、build后test、一致性、包检查及必要安装冒烟；稳定job再设required check。普通验证contents:read，发布job才给OIDC/Release权限，不执行带发布权限的不可信PR代码。

第三方action固定完整SHA，Dependabot维护；concurrency取消被替代任务，设置timeout及短artifact保留期。Actions artifacts会到期，正式分发用npm/GitHub Release。建议的矩阵与来源见规范研究；当前实施状态见A11。

## 7. dshmarket维护

市场来源于精选条目，不是所有npm/GitHub仓库的搜索索引。官方 [contributing](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)要求有效代码、dsh.bundle、满1天、dsh-plugin topic及属实描述；YAML提供url/name/category/description.en，中文可选，一次至多3条。只改自己的data/plugins条目，不改生成README。

npm repository必须映射回收录仓库，不能在YAML手写npm字段。截图可选，本仓库 [声明](../screenshots.json) 为3张；允许1–8张本仓库路径或GitHub托管HTTPS，换截图无需新收录PR。

当前市场兼容将engines.dsh（或dsh.engines.dsh）与相关DSH同线host peers**共同判断**，不是有engines就忽略peer。发现页常查latest，命名版本操作可读该目标版本清单；schemastery/Cordis不按DSH同线版本推算。固定源码依据在规范研究。

全球区域使用在线站点；中国区域通常优先npm catalog，再回退站点。上游当前日构建cron为UTC02:23触发，但可能延迟或失败；可见性应按成功构建和实际catalog确认，不保证“合并后马上/次日必可搜到”。发布前复查 [上游工作流](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/.github/workflows/build-site.yml)。

现有位置描述更正 [PR6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622) 在2026-10-08仍open，跟踪即可，不重复投稿。状态留在A15。
