> 归档快照，2026-10-23 整理。仅供追溯标题所示历史基线；正文中的“当前”“待办”、本机路径和命令均为当时记录。接手工作从 [当前文档导航](../index.md) 开始，开放事项以 [当前待办](../backlog.md) 为准。

# 待办与路线

这是唯一维护未完成事项状态的清单。2026-10-08 [审计快照](research/repository-audit-2026-10-08.md) 的A01–A17为稳定编号；报告保留当时证据，本文件记录后续进度。P1优先处理，P2为功能/交付问题，P3为局部健壮性改进。

本轮本地整改实现于 [984878e](https://github.com/takboo/dsh-usage-state/commit/984878ee0ddc8ce3e42bcbc69d7a5052c6cdcf10)，源码、测试和预构建产物已一起提交；这些整改已于2026-10-10随0.4.5经OIDC发布；GitHub Actions与发布包证据见A13。Node26.10.0、开发下界22.18.0及规范24.21.0的完整319测试均通过、无失败或跳过；HEAD三产物一致性和4份工作流YAML/32组shell校验已通过。最终tarball与隔离运行证据见 [架构验收记录](validation-2026-10-10.md#测试与证据)。发布与CI已在GitHub实跑；真实账户及视觉验收仍按下文单独记录。

## 1. 审计整改

<a id="a01"></a>

### A01 · P1 · provider级凭据覆盖

**状态：已随0.4.5发布。** 有效目标携带apiKeyRef，实际请求、describeCredentials和UI保存优先使用显式ref；provider覆盖优先于legacy source默认。证据：[宿主装配回归](../../tests/host/entry.test.ts)、[交互回归](../../tests/client/interactions.test.ts)，覆盖显式key与默认key共存、真实请求/描述一致及保存目标选择。

<a id="a02"></a>

### A02 · P1 · Moonshot人民币单位

**状态：已随0.4.5发布；真实账户仍未验证。** 去掉≥100除100，按 [官方人民币元定义](https://platform.kimi.com/docs/api/balance.md) 解析并保留现有两位小数舍入。证据：[源测试](../../tests/sources/kimi.test.ts) 的官方envelope、0/99.99/100/100.01/大额、兼容形态和非法字段。

<a id="a03"></a>

### A03 · P2 · 固定端点标记

**状态：已随0.4.5发布。** 共享解析统一provider→legacy→声明origin优先级，入口透传pin。证据：[entry](../../tests/host/entry.test.ts) 固定z.ai端点401不镜像及provider覆盖legacy；[read](../../tests/host/read.test.ts) 保留自动区域镜像能力。

<a id="a04"></a>

### A04 · P2 · 配置身份与缓存/在途隔离

**状态：已随0.4.5发布。** 私有凭据摘要、有效目标签名（含DSH preferredRefs）及generation共同隔离缓存/在途；切端点、同ref轮换、ABA和晚lookup/HTTP均不能恢复旧身份。移除及stop清理调度，不再衍生后续查询，入口用ctx.effect收尾。证据：[entry](../../tests/host/entry.test.ts)、[refresh](../../tests/host/refresh.test.ts)。仍是单source+mode目标，不新增独立多账户支持。

<a id="a05"></a>

### A05 · P2 · legacy models绕过provider配置

**状态：已随0.4.5发布。** models只经normalize迁移，不再独立优先轮询；新版provider拥有隐藏/source/endpoint控制权。权威空LLM目录停止保留配置的目标，未知目录才降级。证据：[targets](../../tests/host/targets.test.ts)、[entry](../../tests/host/entry.test.ts)。

<a id="a06"></a>

### A06 · P2 · 调度语义和配置生效

**状态：已随0.4.5发布。** getState(false)仅初始化缺失/变更身份，30s浏览器轮询不缩短宿主idle；interval更新重调timer，force、回合延迟及成功60s间隔保留。证据：[service](../../tests/host/service.test.ts)、[entry](../../tests/host/entry.test.ts)、[refresh](../../tests/host/refresh.test.ts) 的时钟序列与live配置。

<a id="a07"></a>

### A07 · P2 · DeepSeek非法金额默认0

**状态：已随0.4.5发布。** 有限真实0保留，非法行跳过，无有效余额抛parse并保留同身份旧成功值为stale。证据：[源测试](../../tests/sources/deepseek.test.ts) 和 [完整读取链路](../../tests/host/entry.test.ts)，区分合法零与畸形payload。

<a id="a08"></a>

### A08 · P2 · 两端provider解析不一致

**状态：已随0.4.5发布。** RPC/schema/client state传origin-only endpointHints，设置页和状态行使用同一提示；不传userinfo/query/apiKey。证据：[entry](../../tests/host/entry.test.ts)、[render](../../tests/client/render.test.ts)、[Typert](../../tests/host/typert.test.ts)；未知供应商仍需显式选择来源。

<a id="a09"></a>

### A09 · P2 · 零配置排序

**状态：已随0.4.5发布。** 按可见rows交换邻项并保存完整顺序，默认order为空亦可操作。证据：[交互回归](../../tests/client/interactions.test.ts)，并保留纯排序测试。

<a id="a10"></a>

### A10 · P2 · 失败和旧值展示

**状态：已随0.4.5发布。** 源失败旧值tooltip含具体原因，成功后RPC失败标陈旧/年龄并保留数字；客户端invalidate/generation拒绝旧身份RPC回写，显式force不被普通在途请求吞掉。宿主已解析密钥在错误detail中精确替换为redacted。证据：[entry](../../tests/host/entry.test.ts)、[store](../../tests/client/store.test.ts)、[render](../../tests/client/render.test.ts)、[文字](../../tests/client/status-text.test.ts)。

<a id="a11"></a>

### A11 · P2 · GitHub CI与主分支门禁

**状态：CI与npm OIDC发布已在GitHub实跑；main保护仍待配置。** [2026-10-09 main CI](https://github.com/takboo/dsh-usage-state/actions/runs/37893422944)的Node22.18、规范Node24打包及Node20预构建冒烟均通过。2026-10-10修复Release的job级env引用runner.temp造成的解析失败，新增固定actionlint/checksum的Workflow syntax门禁；限制React及TypeScript的自动major更新，Zod测试不再锁死旧补丁号。main保护仍未配置；维护者已接通npm trusted publisher，稳定tag自动派发main上的Release，首次发布成功证据见A13。

<a id="a12"></a>

### A12 · P2 · 产物一致性和缺失守卫

**状态：已随0.4.5发布，本地及云端产物验收通过。** 缺入口不再skip；metadata/artifacts/package门禁检查必要文件、额外/未跟踪产物、相对HEAD的漂移及真实tarball内容。规范Node24已统一重建并提交，三bundle对HEAD门禁通过；历史本地包的入口、patch、6个相对链接及同包Node20/peer下界隔离运行均通过，见 [本地验收](validation-2026-10-10.md#本轮本地验收2026-10-08)；正式0.4.5的10文件/8个相对链接、同包Node20冒烟及npm/GitHub字节一致性见 [发布验收](validation-2026-10-10.md#首次oidc发布验收2026-10-10)。证据：[bundle测试](../../tests/build/bundle.test.ts)、[产物脚本](../../scripts/verify-artifacts.mjs)、[包脚本](../../scripts/verify-package.mjs)。

<a id="a13"></a>

### A13 · P2 · 发布元数据与版本追溯

**状态：0.4.5已于2026-10-10经OIDC自动发布。** package/lock根版本已同步0.4.5，metadata守卫校对依赖/engines；历史日期/引用已校正。verify:release校验可信main祖先、稳定vM.m.p、tag/package/lock/带日期Changelog及同产物报告。维护者接通的npm trusted publisher已实跑成功；[v0.4.5](https://github.com/takboo/dsh-usage-state/releases/tag/v0.4.5)指向353bb2af09ea983444f2edfe7856a9893476b8d3，[tag自动派发](https://github.com/takboo/dsh-usage-state/actions/runs/38028386351)与 [main Release](https://github.com/takboo/dsh-usage-state/actions/runs/38028392663)均成功。npm registry记录发布时间为2026-10-10T05:44:19.690Z，latest为0.4.5；npm安装包与GitHub附件SHA-256均为 `56e008a2767c6bef3a201a8483e1c4ff8b874e3a3223fe86e477535b9dc19139`，字节比较一致。

<a id="a14"></a>

### A14 · P2 · 开发Node要求

**状态：本地工具链与CI配置完成；Node22.18/24.21完整319回归已通过。** .node-version固定24.21.0、packageManager为npm11.19.1；CI开发下界22.18，Node20只跑预构建JS。schemastery peer/dev下界为3.18.3，锁定解析3.18.4；3.18.2缺volatile，不能再作有效下界。运行≥20/DSH0.2范围不因开发工具改变而扩大。

<a id="a15"></a>

### A15 · P2 · 文档与市场事实漂移

**状态：仓库文档和发布状态已更新，外部描述待合并。** 双语README明确0.4.5已发布、npm0.4.4仍是旧实现，历史快照及修订1–24保留；[开发脚本](../../scripts/dev-local.sh)、客户端类型镜像、状态行位置和Kimi单位注释已按当前行为校正。

[市场条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/takboo__dsh-usage-state.yml)还写输入框下方；[PR6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622)在2026-10-08核验仍open，跟踪既有PR。合并并成功构建/catalog更新后复核实际区域，不重复提交。

<a id="a16"></a>

### A16 · P3 · 异步写入反馈/只读控制

**状态：交互修复已随0.4.5发布，真实凭据写入仍待验证。** ConfigForm真实Promise<boolean>的false转换为失败，mutate拒绝可见；key保存/清除捕获失败、busy/pending阻止重复，并按显式ref选择。配置只读与凭据权限分开，未编辑DraftInput失焦不恢复旧草稿；身份变更后刷新描述/读数。证据：[settings-form](../../tests/client/settings-form.test.ts)、[React交互](../../tests/client/interactions.test.ts)。

<a id="a17"></a>

### A17 · P3 · body阶段网络错误分类

**状态：已随0.4.5发布。** response.json的SyntaxError归parse；AbortError/TimeoutError/transport中断归network。证据：[read测试](../../tests/host/read.test.ts) 覆盖响应头成功后的body失败，保持HTTP/镜像契约。

2026-10-17，0.4.7完成DSH0.2.1-rc.1隔离tarball安装与浏览器RPC复验，修复凭据服务延迟激活/重载后仍走直接回退的问题，并保留0.2.0下界。333项回归与两版真实Typert契约通过；证据及测试边界见 [平台说明](platform-compatibility-2026-10-17.md#dsh-021-compatibility)。

2026-10-17，0.4.8继续验证DSH0.2.1-rc.2，未发现新兼容性问题；源码及三个预构建入口与0.4.7一致，CI矩阵新增rc.2并保留rc.1。真实浏览器的模型1017标记、状态行、凭据优先级与隐藏/恢复往返通过，详见 [rc.2复验](platform-compatibility-2026-10-17.md#dsh-021-rc2-compatibility)。
