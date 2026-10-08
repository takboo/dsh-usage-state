# 待办与路线

这是唯一维护未完成事项状态的清单。2026-10-08 [审计快照](research/repository-audit-2026-10-08.md) 的A01–A17为稳定编号；报告保留当时证据，本文件记录后续进度。P1优先处理，P2为功能/交付问题，P3为局部健壮性改进。

本轮文档重构只完成文档部分，不修复运行实现，也未新增CI、远端保护或发布版本。完成条目需注明实现提交及对应验证；不能以文字已改或单测全绿代替验收。

## 1. 审计整改

<a id="a01"></a>

### A01 · P1 · provider级凭据覆盖

**状态：待修复。** apiKeyRef未进入有效目标/请求。让覆盖、候选和凭据描述使用同一解析；验收只有覆盖key、覆盖与默认key同时存在、fake fetch实际headers和描述一致。应先于扩展更多数据源处理。

<a id="a02"></a>

### A02 · P1 · Moonshot人民币单位

**状态：代码待修复，文档已更正。** [官方定义](https://platform.kimi.com/docs/api/balance.md)以元计；去掉≥100除100并替换固定启发式的测试。验收官方envelope的0、99.99、100、100.01、大额/非法值；文档更正不等于余额路径已可信。

<a id="a03"></a>

### A03 · P2 · 固定端点标记

**状态：待修复。** 入口透传provider pin，明确legacy覆盖优先级；验收显式z.ai端点401不触发镜像，自动区域探测仍可镜像。

<a id="a04"></a>

### A04 · P2 · 配置身份与缓存/在途隔离

**状态：待修复。** 有效endpoint/ref或密钥身份变化后不共享旧值/旧请求；旧generation不能写回新身份。验收切配置、强制刷新、密钥轮换和旧请求迟到。明确source+mode的单账户假设，不在本轮自动新增多账户功能。

<a id="a05"></a>

### A05 · P2 · legacy models绕过provider配置

**状态：待修复。** 旧字段仅迁移或作无新版entry时的fallback；新版provider必须拥有隐藏/source/endpoint控制权。验收旧models+新版隐藏/改源/改端点不继续旧请求。

<a id="a06"></a>

### A06 · P2 · 调度语义和配置生效

**状态：代码待修复，实际频率文档已校正。** interval更新需重调timer；明确RPC读快照与触发查询的职责。验收30s浏览器轮询、成功60s间隔、idle策略、回合延迟、force和修改interval后的完整时钟序列。

<a id="a07"></a>

### A07 · P2 · DeepSeek非法金额默认0

**状态：待修复。** 真实0合法；缺失/非法金额应跳过，无有效值抛parse并保留旧成功读数。验收合法0和非法payload进入store后的旧值/stale差异。

<a id="a08"></a>

### A08 · P2 · 两端provider解析不一致

**状态：待修复。** RPC提供安全有效目标映射或非敏感endpoint hints；普通provider id+官方endpoint无需手配也应显示。验收宿主请求、设置页、状态行一致，不传密钥。

<a id="a09"></a>

### A09 · P2 · 零配置排序

**状态：待修复。** 按当前可见rows顺序交换并保存。验收order为空、新provider未入order和混合自动/显式配置的实际按钮行为。

<a id="a10"></a>

### A10 · P2 · 失败和旧值展示

**状态：待修复。** 源失败旧值tooltip包含具体原因；成功后RPC失败也标陈旧/年龄及传输错误。验收两种成功→失败路径的完整显示，保持旧数字。

<a id="a11"></a>

### A11 · P2 · GitHub CI与主分支门禁

**状态：未实施，流程已写明。** 建立PR/main检查、稳定required job、受控发布与周期依赖维护。标准公开runner即可；发布OIDC/写权限与PR隔离。验收干净检出和外部PR检查不需真实key；远端保护由维护者按协作情况配置。

<a id="a12"></a>

### A12 · P2 · 产物一致性和缺失守卫

**状态：未实施，验证顺序已校正。** 正式路径build后test，缺入口不得skip；检测未跟踪文件和提交产物漂移。当前client已知两处“进度条/环”文案差异需独立修正并同步提交，不在文档改动中隐式重建替换。验收tarball入口及真实registry，并核对GitHub原始交付。

<a id="a13"></a>

### A13 · P2 · 发布元数据与版本追溯

**状态：部分完成。** 0.4.4日期/已发布状态及Changelog历史引用已校正；package-lock根版本、Git tag、GitHub Release和自动一致性检查仍未处理。后续版本操作同步package/lock/日志/已验证tarball，历史引用只用确认提交，不编造tag。

<a id="a14"></a>

### A14 · P2 · 开发Node要求

**状态：说明已更正；固定工具链和CI验证待实施。** 开发使用22.18+的22线或24.11+；运行≥20单独验证。添加一致的版本/包管理器约定，CI测受支持开发线和必要运行冒烟；不能只因开发工具升版本而机械抬高用户下限。

<a id="a15"></a>

### A15 · P2 · 文档与市场事实漂移

**状态：当前文档重构完成；上游描述更正及旧源码/脚本注释仍待处理。** 已补任务导航、开发/排查、术语表，拆清设计/实现/历史/流程，改正单位、Node、HMR、刷新、兼容AND和日构建说明。

[市场条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/takboo__dsh-usage-state.yml)还写输入框下方；[PR6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622)在2026-10-08核验仍open，跟踪此PR而不重复提交。待成功构建/catalog更新后复核所用区域。

源码结构类型/状态行/Kimi注释及开发脚本旧说明仍保留，随相关实现修复校正，不能把它们当当前契约。文档验收：相对/锚点/包内导航、两README关键事实一致，历史报告显式标基线。

<a id="a16"></a>

### A16 · P3 · 异步写入反馈/只读控制

**状态：待修复。** 按真实平台契约保留mutate结果，捕获rejection、显示pending/error、保存/清除统一writable，展示credentialsError；ref/key修改后刷新描述和读数。验收实际异步事件，SSR不替代点击测试。

<a id="a17"></a>

### A17 · P3 · body阶段网络错误分类

**状态：待修复。** json读取中AbortError/TimeoutError/传输错误归network，SyntaxError归parse；补头部成功、body中断用例。

## 2. 尚缺活体或视觉验证

| 项目 | 现有范围 | 需要补的证据 |
|---|---|---|
| Kimi Code | 社区接口/UA及单测；Moonshot余额官方定义已明确 | 真实订阅窗口；先完成A02再核对余额 |
| Sub2API | 固定源码研究、容错单测 | 有版本说明的真实实例响应与单位/窗口 |
| 阈值颜色 | SSR断言severity/currentColor | warn/critical真实视觉；可临时降低warn阈值 |
| 手写凭据 | 写入入口与描述逻辑，未闭环 | 非环境值遮蔽的写入→生效；先处理A01/A16 |
| OpenCode非零与status | 历史真实窗口全0，status只见ok | >0显示及非ok真实语义，不能无证据虚构映射 |
| 独立账户配置 | 当前source+mode合并 | 定义单账户限制/冲突提示，先完成A04 |

## 3. 暂缓能力和候选源

点击状态行进入设置：等待平台公开能力再决定。类型声明仅在第三方复用有需求时增加，当前运行型插件不要求d.ts。

候选优先级低于P1/P2修复。以下来自2026-09的 [接口研究](research/provider-balance-quota-apis.md)，新增前重新核验官方契约及授权要求；这里保留候选理由，不重复维护已实现接口。

| 候选 | 方向/限制 |
|---|---|
| MiniMax Token Plan | API key；剩余百分比需反转 |
| CommandCode | API key；窗口used/cap/reset语义需复核 |
| SiliconFlow | CNY余额，适合当前凭据形态 |
| OpenRouter | credits/key的授权范围与余额/限制口径需确认，无标准5h/7d窗口 |
| Anthropic Claude Pro/Max、Codex/ChatGPT | OAuth与scope，超出现有字符串key渠道 |
| Volcengine Ark | AK/SK签名，需不同凭据形态 |
| Gemini Code Assist/Antigravity | OAuth/本地进程，历史调查不能视作当前平台授权政策 |
| Kimi区域扩展 | 优先核验既有endpoint及区域key，不必直接新增同形Adapter |

## 4. 周期维护

- DSH新发布线出现时在最低/当前线安装tarball并验证宿主激活和RPC；未验先不放宽engines。
- 上游槽位/字号改变时复核真实视觉和公开契约；固定字符串测试不会自己发现平台变更。
- 市场描述只改对应YAML，截图改本仓库screenshots声明；不改生成README。
- 发布/外部规范更新后先研究primary source，再改常青流程；历史报告加明确补充。

<a id="non-goals"></a>

## 5. 明确不做

- 会话成本、价格目录、账本、预算、峰谷/native-search计费及历史面板。
- 新增通用任意余额端点/成本网关功能；已实现Sub2API的实例地址配置仍属当前来源。
- 把当前账户数值复制到历史回合或显示回合Δ；未来账户历史若讨论应按时间定义并新做决定。
- 往会话日志追加自有事件；0.1.5历史实验只是平台背景，本项目“不写日志”的范围决定独立成立。
- 影子替换原生StatsPills或上下文计量器。

理由与演变见 [设计修订](design-changelog.md)，当前约定见 [设计共识](design-consensus.md)。
