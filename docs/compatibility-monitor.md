# DSH 版本监测与快速检查

`Monitor DSH releases` 每小时第17分钟查询官方 GitHub Releases，并支持 Actions 手动输入精确 tag。纳入正式版和 `rc.N` 预发布版；alpha、draft、其他 tag 暂不纳入。基线是 2026-10-23 15:26:39 UTC 已验证的 rc.3 发布事件；按发布日期发现后续版本，因此旧分支新发的维护版本也会检查。每次最多处理10个，余下版本下一轮处理。

每个上游 release ID 对应一个 GitHub Actions bot issue，保存 tag、commit、时间、运行链接、结果和机器可识别的去重标记。定时执行跳过已有 `passed`/旧 `partial`/`failed` 结果；临时故障标为 `retry`，六小时后重试，最多三次。手动指定 tag 可以重测并更新同一 issue。不要复制或编辑 issue 内的标记；关闭 issue 不会删除记录。日志与 JSON 保存在 Actions artifact 90 天，issue 留作长期索引。Actions 定时触发可能延迟；公开仓库长期不活动时定时任务可能被 GitHub 禁用。

检查使用规范工具链、锁定依赖，以及从精确 `@deepseek-ai/dsh` 包元数据读取的 Cordis、schemastery 范围，隔离安装同版本的真实 Typert loader/registry。然后运行 `npm run verify` 和精确版本的 Host、客户端贡献及构建产物契约测试。随后在独立 HOME/DSH_HOME 中安装该版本 DSH 和实际插件 tarball，启动 Web，检查认证后的 HTML，并用无头浏览器验证插件组件运行、真实客户端 RPC、两种模拟模型选择、状态行位置及隐藏/API模式切换。安装或获取元数据失败、基线或契约进程超时/无法启动/被信号终止为 `retry`；已完成的基线或契约测试失败是 `failed`，不自动断言上游不兼容。如果同时有失败和未完成的检查，先按 `retry` 重试，避免丢失未完成的证据。浏览器断言失败是 `failed`，宿主安装或启动等准备故障是 `retry`。依赖范围形状超出脚本可处理范围也进入 `retry`，需人工调查。

**`passed` 表示上述自动检查在指定版本和模拟数据下通过，不自动扩大支持声明。** 浏览器监听实际客户端发出的 RPC，并核对 `getState` 的42.25元、`describeCredentials` 的文件凭据、模型目录及切换响应；fixture 要求模型和余额请求均使用假文件凭据。账号钱包、真实厂商余额、凭据实际保存操作、模型推理和完整视觉验收未自动完成。宿主仅使用假凭据，Node fetch 由 fixture 拦截；此拦截不是所有网络 API 的硬隔离。调整支持范围前仍按 [发布与验收](release.md#功能与宿主验收) 验证。此前 rc.3 的隔离 Web 复验记录见 [平台说明](platform-notes.md#dsh-021-rc3-复验0410)。

监测任务不运行 Agent，不修改代码，不创建 PR，不合并或发布。执行上游依赖的检查 job 没有 issue 写权限和持久 Git 凭据；独立报告 job 使用 issue 写权限，只读取并验证报告数据。issue 创建依赖仓库允许 GitHub Actions 写入 issues。工作流需合并到默认分支后才会按计划运行；本地测试或未推送修改不等于线上已启用。

手动运行：Actions → **Monitor DSH releases** → Run workflow，输入例如 `dsh-v0.2.1-rc.3`。仅接受上游已发布的正式版或 RC 精确 tag。若发现和报告本身失败，Actions run 显示失败，尚无 issue；应查看日志并手动重跑。此步骤不会触发插件发布流程。

## 本地复现宿主启动检查

使用规范 Node/npm，在仓库根目录运行：

```sh
export DSH_VERSION=0.2.1-rc.3
export DSH_WEB_ROOT="$(mktemp -d /tmp/dsh-web-check.XXXXXX)"
export DSH_REPORT_DIR="$(mktemp -d /tmp/dsh-web-report.XXXXXX)"
node scripts/compatibility/web-smoke.mjs
```

脚本会安装对应版本 DSH、固定 pnpm 和 Playwright，打包当前插件，创建隔离 profile，安装 tarball，验证启动 URL 的 cookie 交换、Web HTML、浏览器组件、RPC、模型切换、余额显示和隐藏/API配置往返。环境只包含临时 HOME、DSH_HOME、Documents 工作区和假 API key；不继承实际账号环境或当前目录的 `.env`。不得将 `DSH_WEB_ROOT` 指向真实用户目录；脚本拒绝使用非空的 `DSH_WEB_ROOT`。输出目录的 `web-host.log` 可排查安装问题。测试使用宿主文件与环境中不同的假凭据，断言宿主选择文件凭据。Linux 首次运行还会安装 Chromium 所需系统依赖；可用 `DSH_BROWSER_EXECUTABLE` 指定本机浏览器供本地排查，CI 使用 Playwright 固定的 Chromium。
