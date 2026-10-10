# 开发指南

从仓库根目录运行命令。代码地图见 [架构与验证](architecture.md)，当前缺陷和验收标准见 [待办清单](backlog.md)，正式发布见 [发布与验收](release.md)。

## 工具链

运行预构建插件仍声明Node≥20。开发兼容下界是Node22.18+的22线或Node24.11+；规范构建使用 [.node-version](../.node-version) 固定的 **24.21.0**，npm由 [packageManager](../package.json) 固定为 **11.19.1**。

当前tsdown要求 `^22.18.0 || >=24.11.0`，测试hook依赖registerHooks；Node22.6的最初类型剥离不能运行本项目。schema peer/dev下界已更正为3.18.3，锁文件解析3.18.4；3.18.2缺少Config所需volatile，不能靠polyfill冒烟掩盖。版本背景见 [规范研究](research/repository-release-standards-2026-10.md)，当前声明以包清单/锁文件为准。

```bash
node --version
npm --version
npm ci
npm run typecheck
npm test
```

平常验证使用 `npm ci` 复现锁文件。只有有意调整依赖时才使用 `npm install` 并审查锁文件变化。缓存目录不可写是环境特例；可临时加 `--cache /tmp/dsh-usage-state-npm-cache`，不要求所有贡献者都使用同一缓存。

React开发依赖、DOM、renderer及对应类型保留18线，以匹配宿主浏览器模块表；升级必须成套验证。TSX测试hook使用TypeScript的JavaScript编译API，当前保留5线；TypeScript7的导出不能直接替代该API。Dependabot忽略这两组的major更新，其他兼容更新仍自动检查。

## 构建和测试

| 命令 | 实际行为 |
|---|---|
| npm run typecheck | tsc检查src与tests，不生成产物 |
| npm test | node:test跑TS/TSX；hook转译TSX并替换浏览器UI原语桩件 |
| npm run build | 清理lib并重建宿主index、Typert清单及浏览器client |
| npm run watch | watch同一份tsdown配置，包含宿主和客户端两组入口 |
| npm run test:watch | 监听测试变化；不替代构建watcher |
| npm run verify:metadata | 校对package/lock、固定npm和开发Node要求 |
| npm run verify:artifacts | 检查必要产物、额外文件及相对HEAD漂移 |
| npm run verify:package | 生成或校验实际tarball、入口/patch/离线链接，并记录checksum/report |
| npm run verify:release | 校验已有稳定tag、可信main祖先与发布元数据 |
| npm run smoke:runtime | 运行预构建JS，支持独立tarball安装及指定真实schema版本 |
| npm run verify | metadata→typecheck→build→test→artifacts→package |

改实现后、提交前先执行：

```bash
npm run verify:metadata
npm run typecheck
npm run build
npm test
npm run verify:package
```

必要产物缺失现在是测试硬失败。三个bundle与源码需要一起审阅、提交；随后执行 `npm run verify`。verify:artifacts比较 **HEAD**，故已重建但未提交的产物修改会合理失败，暂存也不会消除该失败。不要跳过门禁或用旧产物替代新代码；在规范Node24.21.0上完成构建后，提交再复核一致性。

源码、构建产物和真实包入口由现有门禁分别检查，具体发布/tarball及Node20冒烟见 [发布流程](release.md)。本轮包号仍0.4.4，所有整改属于Unreleased；不能把生成本地0.4.4.tgz当成已发布npm0.4.4同一内容。

## 本地宿主回路

开发脚本使用现有DSH CLI，并为插件创建link安装的profile。为了避免继承真实 `DSH_HOME`，明确指定独立home：

```bash
npm run build
DSH_HOME=/tmp/dsh-usage-state-dev PROFILE=p PORT=3099 scripts/dev-local.sh
```

需要全新环境时，为这次运行选择新的临时目录；不要把上面的DSH_HOME改成真实用户home。脚本默认值 `/tmp/dsh-dev` 只在变量未设置时生效。已存在的开发profile会复用，脚本也不会自动替换已存在的同名依赖；复用前确认其link仍指向本检出。可用 `DSH=/path/to/dsh` 指定CLI。

另一个终端启动产物watcher：

```bash
npm run watch
```

该命令同时重建宿主与客户端入口。客户端是否热替换取决于以下条件：宿主启用了client-hmr传输，watcher重建的是宿主实际读取的同一份client产物，浏览器接收通道正常。缺少任一条件时，先检查构建和连接，再刷新页面；不要把“保存即可自动生效”当成无前提保证。HMR会重挂载插件，React本地草稿可能丢失。

宿主源码、patch及宿主加载的清单变动需要重启开发宿主。DSH自身shell源码改动属于宿主仓库的构建流程；本插件watch不负责重建shell。平台版本相关的解析/HMR依据见 [平台说明](platform-notes.md)。

全新home有独立凭据文件，但宿主仍会继承启动进程的环境变量；它不保证没有环境key。结构测试无需真实账户；需要比对余额或字体影响时，应明确选择已授权的验证环境，避免从某次本机状态推广所有用户的行为。

## link与打包验证

link适合迭代，会使用工作树产物及其可见开发依赖。它不能替代干净tarball安装：后者验证正式文件白名单和真实平台依赖解析。发布前按发布文档创建独立home并安装tarball。

常用安装命令，执行前确认目标profile：

```bash
npm pack --pack-destination /tmp
package_version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version")
DSH_HOME=/tmp/dsh-usage-state-verify dsh plugin --profile p add "/tmp/dsh-usage-state-$package_version.tgz"
```

不要未经验证增加prepare/prepack迫使安装者构建。DSH的pnpm Git安装、普通npm Git安装和预构建tarball的生命周期规则不同。

## 修改与贡献

- 修缺陷时优先覆盖用户实际路径，例如provider配置→真实装配→fake fetch，而不仅验证字段被normalize保留。
- 测试用假凭据、假fetch和注入时钟；不要提交或打印真实key。厂商fixture注明来源，并去除账户信息。
- 增加数据源按 [适配器指南](adapters.md) 更新注册、自动识别和必要词典，维护中英README关键事实。
- 可见行为改变后更新用户说明、Backlog状态与Unreleased；实际发布日期以registry记录为准。
- 新设计取舍追加 [设计修订](design-changelog.md)。历史研究的错误用勘误或补充记录，不覆盖原始证据。
- 本地已配置 [CI](../.github/workflows/ci.yml)、[Dependabot](../.github/dependabot.yml) 和默认verify的 [手动Release](../.github/workflows/release.yml)，自动化状态见A11/A14。工作流尚未推送实跑，main保护与npm publisher仍需维护者配置。
- 所有本轮修复记录为Unreleased，npm0.4.4仍是旧实现；产物和源码统一提交后再完成HEAD一致性门禁，实际tag/Release/npm发布是后续操作。
