> 归档快照，2026-10-23 整理。仅供追溯标题所示历史基线；正文中的“当前”“待办”、本机路径和命令均为当时记录。接手工作从 [当前文档导航](../index.md) 开始，开放事项以 [当前待办](../backlog.md) 为准。

## 测试与证据

| 验证层 | 入口 | 当前范围与限制 |
|---|---|---|
| 纯字段/来源 | [providers](../../tests/shared/providers.test.ts)、[Kimi](../../tests/sources/kimi.test.ts)、[DeepSeek](../../tests/sources/deepseek.test.ts) | 官方元单位、真实0/畸形字段及legacy/provider优先级；未调用真实账户 |
| 宿主装配 | [entry](../../tests/host/entry.test.ts) | fake ctx/fetch下的ref/pin、轮换、ABA、晚lookup/HTTP、目标移除、错误密钥回显脱敏 |
| 调度 | [refresh](../../tests/host/refresh.test.ts)、[service](../../tests/host/service.test.ts) | 30s普通poll不改变idle、live重调、force、回合及stop序列 |
| 客户端 | [store](../../tests/client/store.test.ts)、[render](../../tests/client/render.test.ts)、[interactions](../../tests/client/interactions.test.ts) | 身份失效与force排序、两UI提示/失败显示、真实React回调/效果；不是浏览器布局或真实平台写入 |
| 平台契约 | [host Typert](../../tests/host/typert.test.ts)、[client contribution](../../tests/client/contribution.test.ts) | 使用当前真实validator/registry；不替代完整DSH安装 |
| 构建与包 | [bundle](../../tests/build/bundle.test.ts)、[artifacts](../../scripts/verify-artifacts.mjs)、[package](../../scripts/verify-package.mjs) | 缺文件硬失败；HEAD一致性及真实tarball白名单/入口/patch/离线链接；提交前产物漂移合理失败 |
| Node运行边界 | [runtime smoke](../../scripts/runtime-smoke.mjs) | 预构建JS/fake host；可独立安装tarball和真实schema指定版本，不注入volatile polyfill |

本轮实现提交为 [984878e](https://github.com/takboo/dsh-usage-state/commit/984878ee0ddc8ce3e42bcbc69d7a5052c6cdcf10)。Node26.10.0、开发下界22.18.0与规范24.21.0完整319回归均通过，无失败或跳过；规范Node24产物已提交，HEAD三bundle一致性、元数据及工作流解析/权限依赖校验通过。2026-10-08原审计281测试/10文件打包是历史基线，不是本轮运行证据。

### 本轮本地验收（2026-10-08）

| 检查 | 实际结果 |
|---|---|
| 完整回归 | Node26.10.0、22.18.0、24.21.0均319通过、0失败、0跳过 |
| 提交与产物 | 实现984878e；三预构建文件对HEAD一致；缺入口检查硬失败 |
| 工作流 | 4份YAML真实解析、32组shell语法、16处完整SHA；稳定发布依赖Node20，默认verify；npm/GitHub分权 |
| 发布标签保护 | 临时克隆中验证合法稳定标签及拒绝重复已发布npm版本；真实仓库未创建标签 |
| 最终包 | 文档提交6880bd411f8efa264edb1aa02267047602503585的干净检出产生10文件tarball；入口、patch、6个包内相对链接及报告/checksum复验通过 |
| 运行边界 | 同一个tarball在Node20.20.2隔离安装真实schema3.18.4和声明下界3.18.3，各自宿主/RPC codec/fake fetch通过，无polyfill |

包名为dsh-usage-state-0.4.4.tgz，本地未发布产物与registry已发布0.4.4不同。上述同一包的SHA-256为 `7c738d8fc6659abbd1182a022e548c28d27e32a1680209224a8aaa5ff31a459c`，报告workingTreeDirty=false。验收补充只修改未随包的架构/待办文档，不重新打包或改写这份已验证字节。

这些都是本地验证：没有GitHub Actions云端执行、npm/GitHub发布、真实DSH profile安装、真实凭据写入或厂商账户/视觉验收。Node20加载/模拟RPC通过不等同于所有受支持DSH发行版均真机验证。

历史真机证据（2026-10-05、DSH0.2.0-rc.2）覆盖DeepSeek、z.ai、OpenCode正常读数、设置页及槽位位置，来自修订17–23和截图。历史真实key直连是在线查询。Kimi Code/Sub2API真实账户、高阈值视觉、真实手写key生效和OpenCode非零仍未闭环。

规范工具链固定Node24.21.0/npm11.19.1；schema下界为3.18.3、锁3.18.4。运行Node≥20与DSH0.2声明未因开发工具扩张。结构类型镜像仍需平台/安装验证。

### 首次OIDC发布验收（2026-10-10）

| 检查 | 实际结果 |
|---|---|
| 发布引用 | v0.4.5指向 [353bb2a](https://github.com/takboo/dsh-usage-state/commit/353bb2af09ea983444f2edfe7856a9893476b8d3)，package/lock及带日期Changelog一致 |
| main CI | [四项检查通过](https://github.com/takboo/dsh-usage-state/actions/runs/38028317296)：工作流语法、Node22.18开发回归、规范Node24打包及Node20预构建冒烟 |
| 自动发布 | [tag派发成功](https://github.com/takboo/dsh-usage-state/actions/runs/38028386351)，随后 [main Release](https://github.com/takboo/dsh-usage-state/actions/runs/38028392663)通过319测试、同包Node20冒烟、npm OIDC发布及GitHub附件上传 |
| npm | [registry元数据](https://registry.npmjs.org/dsh-usage-state)记录0.4.5发布于2026-10-10T05:44:19.690Z，latest为0.4.5，包含provenance attestation |
| 最终字节 | 本地干净发布检出的10文件tarball、npm下载包与 [GitHub Release附件](https://github.com/takboo/dsh-usage-state/releases/tag/v0.4.5)完全一致；8个包内相对链接验证通过 |

已发布包SHA-256为 `56e008a2767c6bef3a201a8483e1c4ff8b874e3a3223fe86e477535b9dc19139`。发布后文档更新不移动v0.4.5，也不重新发布已占用版本。上述云端和字节验收补充了2026-10-08本地证据；真实DSH profile安装、凭据写入、厂商账户和视觉验收范围不变。

具体命令见 [开发指南](../development.md)，发布与tarball见 [发布流程](../release.md)。CI、Dependabot和Release已在GitHub；稳定版本tag自动派发main上的Release，npm publisher/OIDC已实跑成功。main保护仍待配置；实际发布状态见 [Backlog](../backlog.md)。
