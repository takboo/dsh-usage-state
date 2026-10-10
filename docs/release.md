# 发布与验收

本文件是维护流程。已发布事实放 [更新日志](../CHANGELOG.md)，状态见 [Backlog](backlog.md#a11)，外部规则见 [规范研究](research/repository-release-standards-2026-10.md)。CI、Dependabot与Release已在GitHub。2026-10-10修复Release表达式上下文并加入工作流语法门禁；[0.4.5发布流程](https://github.com/takboo/dsh-usage-state/actions/runs/38028392663)已通过，npm trusted publisher/OIDC及稳定tag自动派发均已实跑成功。npm与GitHub Release的安装包字节一致，证据见 [Backlog](backlog.md#a13)；main保护仍未配置。

## 1. 版本和支持范围

- 本次版本、package/lock根元数据、正式Changelog条目、已验证产物、Git引用应来自同一发布提交。版本不可重用。
- Changelog日期采用npm实际发布时间的UTC日期；Unreleased只记录尚未发版的变更。0.4.4已于2026-10-06发布，不能继续标待发布。
- 当前DSH范围是 `>=0.2.0-rc.2 <0.3.0-0`，运行Node声明≥20。开发使用Node22.18+的22线或24.11+；发布建议符合条件的Node24及npm≥11.5.1。
- 平台依赖的锁定基线与所声明下界必须实际复验；结构类型镜像/编译相同不能证明最低宿主兼容。新DSH发布线先验再扩大范围。
- 维护者应给今后版本创建一致的tag（例如v<version>）及GitHub Release；历史没有tag时，Changelog使用有依据的commit，不补造发布点。

当前package/lock为0.4.5，本轮修复已移入带日期版本章节并正式发布。npm0.4.4和0.4.5均已占用；历史本地0.4.4 tarball内容与当时发布不同，不能再次发布该号。源码和bundle应一起提交；verify:artifacts对HEAD检查，提交前的新产物diff是合理失败，不可隐藏。新版本需先同步package/lock、带日期Changelog和稳定tag。

## 2. 构建、最终产物与打包

在固定开发工具链上，提交前执行本地回归：

```bash
npm ci
npm run verify:metadata
npm run typecheck
npm run build
npm test
npm run verify:package
```

必要bundle缺失现在是测试硬失败。审阅并一起提交源码、bundle和元数据后执行 `npm run verify`；它按metadata→typecheck→build→test→artifacts→package验证。verify:artifacts检查相对HEAD的diff以及额外/未跟踪生成文件，暂存不会消除差异；提交前失败不能当成门禁错误。规范产物使用Node24.21.0/npm11.19.1。

发布白名单以 [package清单](../package.json) 为准，仍为10文件：三个入口、patch、双语README、许可、Changelog、适配器指南和package清单。verify:package读取真实tarball，校验入口/patch/离线链接和白名单，不以dry-run代替正式产物；未随包文档用GitHub链接。

在干净、已提交检出中打包一次，并保留报告/checksum和路径：

```bash
release_dir=$(mktemp -d "${TMPDIR:-/tmp}/dsh-usage-state-release.XXXXXX")
package_version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version")
npm run verify:package -- --out-dir "$release_dir"
tarball="$release_dir/dsh-usage-state-$package_version.tgz"
npm run smoke:runtime -- --tarball "$tarball"
```

验证已有tarball时用 `--tarball`，不要重pack或覆盖同名文件。报告记录sourceCommit、workingTreeDirty及SHA-256；正式发布要求报告来自干净检出，并匹配可信tag和同一字节。Node20只运行这份预构建JS的独立安装冒烟，不在20上跑TS/TSX或构建；可通过 `--schema-version` 复验真实schema下界，不注入polyfill。

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

在声明的最低DSH和当前受支持DSH上复验。真实宿主启动、客户端挂载和RPC往返是不同证据，任一失败都不能记兼容通过。本轮本地整改未新增完整真机DSH安装/浏览器往返证据，Node预构建冒烟不替代此验收。

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

本轮本地fake账户/时钟/React交互回归已覆盖过去的失败路径，最终跨Node/tarball证据在交付时同步。真实DSH凭据落盘、完整浏览器RPC、厂商账户和视觉仍需单独验收；不把本地测试或历史截图记成这些真实操作已完成。

## 5. 发布并核对版本

[Release](../.github/workflows/release.yml) 只支持稳定 **vM.m.p**。新建版本tag的push自动派发可信main上的同一工作流，mode=publish；tag入口只有actions:write权限，不执行npm发布。非稳定tag不派发；移动或删除tag不触发发布。手动触发仍须选择main，默认 **verify**。先验证tag是origin/main祖先、package/lock一致且有带日期版本章节，再checkout不可变commit。规范Node24验证/打包一次；同tarball继续做Node20预构建独立安装。

选择publish才执行npm job，前提是维护者已配置对应owner/repository/release.yml的trusted publisher并允许direct publish。该job仅contents:read/id-token:write，校验未占用版本、报告commit和checksum，发布同一tgz并ignore-scripts。固定Node24.21.0/npm11.19.1满足OIDC最低要求；公开repo+包的自动provenance依据见 [官方npm文档](https://docs.npmjs.com/trusted-publishers/)。维护者已接通publisher；首次OIDC实跑与实际npm版本见 [Backlog](backlog.md#a13)。

推送release提交到main并等待CI通过，再推送版本tag。GitHub的GITHUB_TOKEN允许触发workflow_dispatch；发布工作流与npm授权仍绑定release.yml/main，tag入口无需额外长期Token。依据见 [GitHub触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)。

GitHub Release附档由独立contents:write job执行，再核对同一报告/tgz，附相同tarball和checksum。npm已成功而附档失败时，在7天artifact保留期内单独重跑失败附档job；它不要求npm版本仍未使用，不再次publish或重pack。Actions artifact不是永久分发渠道。

人工方式同样在干净的可信tag检出使用门禁；先同步新版本/Changelog/tag，已发布0.4.4不可重用。认证按npm当次权限/2FA处理：

```bash
npm run verify:release -- --tag "v$package_version" --artifact-report "$release_dir/verification.json" --require-unpublished &&
npm run verify:package -- --tarball "$tarball" --expected-version "$package_version" --require-report &&
npm publish "$tarball" --tag latest --ignore-scripts &&
npm view "dsh-usage-state@$package_version" version engines repository gitHead dist --json
```

只发布上一步验证的同一tarball。明确版本仍受pnpm年龄策略/镜像/cache影响，安装结果需实查。历史没有tag/Release时按确认gitHead追溯，不补造发布点。

## 6. GitHub本地配置与外部验收

[CI](../.github/workflows/ci.yml) 在PR/main/manual触发，开发下界Node22.18执行类型/构建/测试；规范Node24.21另做HEAD一致性和实际pack，Node20job只消费该artifact。标准Ubuntu公开runner，普通job为contents:read；checkout不保留凭据，action完整SHA、有限timeout/concurrency和7天artifact保留已配置。

[Dependabot](../.github/dependabot.yml) 每周分组检查action和npm升级，React及对应类型/renderer、TypeScript的major更新需单独迁移。CI的Workflow syntax使用固定actionlint1.7.12和SHA-256校验归档，检查整份Release的表达式；单纯YAML解析不能检测不可用的上下文。Release的npm OIDC与GitHub写入权限分别属于独立job。main CI已实跑，尚未设置required checks/main保护；验证稳定job后由维护者设置远端规则，状态见A11。

## 7. dshmarket维护

市场来源于精选条目，不是所有npm/GitHub仓库的搜索索引。官方 [contributing](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)要求有效代码、dsh.bundle、满1天、dsh-plugin topic及属实描述；YAML提供url/name/category/description.en，中文可选，一次至多3条。只改自己的data/plugins条目，不改生成README。

npm repository必须映射回收录仓库，不能在YAML手写npm字段。截图可选，本仓库 [声明](../screenshots.json) 为3张；允许1–8张本仓库路径或GitHub托管HTTPS，换截图无需新收录PR。

当前市场兼容将engines.dsh（或dsh.engines.dsh）与相关DSH同线host peers**共同判断**，不是有engines就忽略peer。发现页常查latest，命名版本操作可读该目标版本清单；schemastery/Cordis不按DSH同线版本推算。固定源码依据在规范研究。

全球区域使用在线站点；中国区域通常优先npm catalog，再回退站点。上游当前日构建cron为UTC02:23触发，但可能延迟或失败；可见性应按成功构建和实际catalog确认，不保证“合并后马上/次日必可搜到”。发布前复查 [上游工作流](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/.github/workflows/build-site.yml)。

现有位置描述更正 [PR6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622) 在2026-10-08仍open，跟踪即可，不重复投稿。状态留在A15。
