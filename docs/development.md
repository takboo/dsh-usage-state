# 开发指南

从仓库根目录运行；当前设计见 [设计共识](design-consensus.md)，代码入口见 [架构](architecture.md)，发版见 [发布流程](release.md)。

## 工具链与本地回路

规范Node由 [.node-version](../.node-version) 固定，npm由 [packageManager](../package.json) 固定。开发下界是Node22.18+的22线或Node24.11+；预构建运行下界Node20与开发要求不同。

```bash
node --version
npm --version
npm ci
npm run verify:metadata
npm run typecheck
npm run build
npm test
npm run verify:package
```

用 `npm ci` 复现锁文件；有意改依赖时才执行install并审查lock变化。React及相关DOM/类型/renderer保留18线，与宿主模块表匹配；TSX hook依赖TypeScript5的编译API，major升级需单独验证。

源码、bundle、元数据一起审阅并提交后运行 `npm run verify`。其中 `verify:artifacts` 比较HEAD；提交前的新bundle漂移属预期，暂存不会消除差异。该检查保护GitHub直接安装的预构建入口，避免源码和发布代码脱节。

## 隔离宿主开发

使用现有DSH CLI并显式指定独立home；本脚本用于link迭代：

```bash
npm run build
DSH_HOME=/tmp/dsh-usage-state-dev PROFILE=p PORT=3099 scripts/dev-local.sh
```

另一个终端运行 `npm run watch`，同时重建Host和client。已有profile会复用，确认其link仍指向本检出；可用 `DSH=/path/to/dsh` 指定CLI。新home仍会继承启动环境变量，fixture验证使用假凭据环境。

客户端热替换需要宿主client-hmr传输、同一份实际加载产物被重建、浏览器通道有效；缺条件时刷新页面。HMR重挂载可能丢失React草稿。Host源码、patch和Host清单变更需要重启宿主；DSH自身shell源码采用上游构建流程。

link能访问工作树开发依赖，适合迭代；交付验证使用实际tarball在独立home安装，见 [发布与验收](release.md)。

## 修改时关注

- 回归覆盖用户实际调用链：provider配置→身份→实际读取→RPC→显示。账号fixture和API Key fixture使用不同身份及金额。
- 测试注入时钟、假凭据与fetch；厂商fixture保留单位/形状来源并去身份信息。
- 修改源码后重建三个bundle；增加来源遵循 [适配器指南](adapters.md)。线上类型变更同步Host codec及产物测试。
- 配置/ref变更、换号/签出、旧请求晚返回和stop必须保留身份隔离；服务可能延迟激活或重载，每次读取重新获取当前Host服务。
- 当前行为写对应职责文档，待验证项写 [Backlog](backlog.md)，待发变更写Unreleased；旧研究在明确需要时从 [归档](archive/README.md) 查证。
