# dsh-usage-state

DSH 的余额与额度插件：Host 查询账户读数，Client 在设置页和输入框上方展示。只处理当前余额/套餐窗口，不做回合成本归因、账本或历史统计。领域词汇见 [CONTEXT.md](CONTEXT.md)。

## 实现边界

- 配置单元是 provider；当前每个 source+mode 仅保留首个有效 provider 的目标，不代表独立多账户支持。端点与自动发现的凭据必须属于同一 owner；不能把另一个 provider 的密钥或来源不明的默认密钥发到自定义 origin。
- 密钥、登录 grant 和私有身份摘要只留在 Host，不得进入 RPC、Client、日志或错误详情。账号模式不回退到 API Key。
- 配置/凭据/登录身份变化和 stop 后，旧异步结果不得恢复缓存；HTTP 必须受生命周期取消约束，取消后不得启动镜像/备用请求。失败只保留同身份成功读数。
- Client 不运行时导入或加载 Harness Client 包；以类型导入描述宿主服务，自有语义控件使用宿主主题 token。保留模块加载器工厂、slot 归属和订阅清理。
- 改动 Harness Service/Event/Config/Slot 接口前，使用运行时 `cordis_inspect_list` 和定向 `cordis_inspect_query` 确认契约；无法检查时说明边界，不把目录缺项当成接口已删除。

## 按任务读取

- 改 Host、RPC、缓存或调度：先看 [架构与验证](docs/architecture.md)；行为取舍看 [设计共识](docs/design-consensus.md)，版本兼容看 [平台说明](docs/platform-notes.md)。
- 新增或修改厂商数据源：看 [适配器指南](docs/adapters.md)，同步来源目录、配置、双语文案与单位/窗口 fixture。
- 改 Client、配置表单或本地 HMR：看 [开发指南](docs/development.md)；不要用直接 DOM 操作或绕过 configForms 的独立配置写入路径。
- 打包、发版或安装验收：看 [发布流程](docs/release.md)。真实账户、凭据落盘和视觉待验项记录在 [Backlog](docs/backlog.md)；历史研究仅按需从 [文档导航](docs/index.md) 查找。
- 接入、复跑或升级共享基座：从 [版本锁](dsh-engineering.lock.json) 读取契约版本，按 [试点复跑入口](docs/compatibility/engineering-pilot.md) 验证候选包。

## 开发与验证

在仓库根目录运行。Node 以 [.node-version](.node-version)、npm 以 [packageManager](package.json) 为准；开发工具链要求高于预构建包的运行下界。依赖已安装时不要例行重装；需要复现锁文件时使用 `npm ci`，有意改依赖才更新锁文件。

1. 为缺陷先补可复现的回归，使用假凭据、fetch、账号服务与注入时钟；不调用真实余额接口、不使用真实密钥。
2. 修改后执行：

   ```bash
   npm run verify:metadata
   npm run typecheck
   npm run build
   npm test
   npm run smoke:runtime
   npm run verify:package
   git diff --check
   ```

3. 三个预构建入口位于 `lib/`，必须从源码统一重建并随源码审阅/提交，不能只手改 bundle。修改发布资源时同步 exports/files，检查实际 tarball 内的图标、locale 和运行文件。
4. `npm run verify:artifacts` 比较 **HEAD**；提交前重建造成的差异是预期，但不能绕过或隐藏检查。提交后再运行 `npm run verify`；不要为让检查变绿而自动提交。
5. `smoke:runtime` 无参数时运行本地预构建 fixture；`--tarball` 会创建独立安装环境。安装、重启宿主、发版及真实账户操作需在用户要求的范围内，不因本地测试自动修改当前 GUI profile。

报告区分源码/fixture测试、实际包验证和真实宿主/浏览器验收；记录未通过的检查与原因，不用单元测试成功代替视觉或真实账户成功。待发变更写入 [CHANGELOG.md](CHANGELOG.md) 的 Unreleased，文档只同步本次直接影响的当前行为，不改写历史发布证据。

本仓库的 Git 提交标题与正文使用中文；代码标识符、包名和命令保留原文。
