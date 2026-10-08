# 开发指南

从仓库根目录运行命令。代码地图见 [架构与验证](architecture.md)，当前缺陷和验收标准见 [待办清单](backlog.md)，正式发布见 [发布与验收](release.md)。

## 工具链

运行预构建插件声明 Node ≥20；开发与构建要求更高：使用 Node 22.18+ 的22线，或Node 24.11+。建议日常使用满足要求的Node24。

原因是当前 tsdown 0.22.14 的 engines 为 `^22.18.0 || >=24.11.0`，测试 hook 还依赖 `node:module.registerHooks`。Node22.6首次支持类型剥离，不代表能运行本仓库测试；原生类型剥离也不做类型检查或处理TSX。版本依据见 [官方规范研究](research/repository-release-standards-2026-10.md)。

```bash
node --version
npm --version
npm ci
npm run typecheck
npm test
```

平常验证使用 `npm ci` 复现锁文件。只有有意调整依赖时才使用 `npm install` 并审查锁文件变化。缓存目录不可写是环境特例；可临时加 `--cache /tmp/dsh-usage-state-npm-cache`，不要求所有贡献者都使用同一缓存。

## 构建和测试

| 命令 | 实际行为 |
|---|---|
| npm run typecheck | tsc检查src与tests，不生成产物 |
| npm test | node:test跑TS/TSX；hook转译TSX并替换浏览器UI原语桩件 |
| npm run build | 清理lib并重建宿主index、Typert清单及浏览器client |
| npm run watch | watch同一份tsdown配置，包含宿主和客户端两组入口 |
| npm run test:watch | 监听测试变化；不替代构建watcher |

改实现后的完整检查顺序：

```bash
npm run typecheck
npm run build
npm test
npm pack --dry-run --json
```

构建后再跑测试，才能验证这次实际产物。三个预构建文件需要提交，以支持DSH通过GitHub安装本仓库。源码和已提交产物之间已有两处词典文案漂移，跟踪 [A12](backlog.md#a12)；在其修复前，完整重建可能显示已有差异，不能把它当成本轮变更偷偷吞掉。

正式交付还需检查缺失/未跟踪产物。当前产物测试在必要文件缺失时会skip，不能仅凭 `npm test` 成功证明发布内容完整；具体要求见发布文档。

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
- 当前尚无GitHub CI，自动门禁与工具链固定由 [A11](backlog.md#a11)、[A14](backlog.md#a14) 跟踪；文档描述的是应执行的检查，不表示已配置工作流。
