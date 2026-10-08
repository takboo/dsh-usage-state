# 仓库审计：dsh-usage-state

本报告是审计快照，不替代现有 [Backlog](../backlog.md)。基线为 `3ad9a71`、包版本 `0.4.4`；开始时工作区干净。核验日期采用宿主 UTC 时钟：2026-10-08。外部规范与时效说明见 [官方规范研究](repository-release-standards-2026-10.md)。

> 后续说明：本轮已按此审计重构常青文档，文档/版本记录部分的状态发生变化；原发现、验证数字和行号保留审计基线含义。当前进度见Backlog的A01–A17，文档入口见 [导航](../index.md)。下文不是新的待办状态清单，也不表示实现缺陷已修。

## 结论

项目的模块划分、适配器契约和平台契约测试有扎实基础，暂不需要改成 monorepo 或增加通用框架。主要问题集中在**配置到实际请求的装配链路、账户身份与缓存、客户端失败展示，以及人工发布流程**。281 条测试全部通过，但部分测试固定了错误业务语义，部分字段则在各模块单独测试通过后于装配时丢失。

发现两项应优先修复的 P1：供应商级凭据覆盖失效，以及 Moonshot ≥100 元余额被缩小 100 倍。P2 涉及配置变更、迁移、调度、客户端与宿主解析，以及源码/产物/版本记录的漂移。当前公开 GitHub 仓库没有 Actions、主分支保护或 ruleset，免费 CI/CD 能力基本没有利用。

等级表示修复优先级，不是漏洞评分：P1 应进入下一次修复发布；P2 是明确的功能、稳定性或交付问题；P3 是局部健壮性改进。没有仅凭猜测报告 P0，也没有把未实现的数据源、历史账单或成本统计当成缺陷。

## 实测结果与范围

| 检查 | 结果 | 结论范围 |
|---|---|---|
| 工作区类型检查和测试 | 通过，281 passed、0 skipped | Node 26.10.0、npm 11.19.1 |
| 干净检出中 npm ci → 类型检查 → 测试 → 构建 | 全部通过，281 passed、0 skipped | git archive HEAD 导出；没有修改锁文件 |
| 独立重建并比较提交产物 | 宿主/Typert 相同；客户端两处文案不同 | 提交产物仍为“进度条 / Show progress bar”，源码是“进度环 / Show progress ring” |
| npm pack --dry-run --json | 10 个文件，约 59 KB 压缩、189 KB 展开 | 入口、patch、README、许可、Changelog、适配器文档均在；源码/测试不随包 |
| 运行依赖及完整 npm audit | 均为 0 个已知 advisory | 不证明业务逻辑或供应链完全安全 |
| Node 20.20.2 加载宿主/Typert 产物 | 通过 | 仅加载冒烟，不是完整 DSH/全部行为兼容证明 |
| Node 22.6.0 启动现有测试入口 | 失败：没有 registerHooks 导出 | README 开发最低版本说明错误 |
| GitHub API | public；含 dsh-plugin topic；workflow/release/tag 均为 0 | rulesets=[]；main 未保护；只有 main 分支 |
| 本地 Markdown 相对文件链接 | 15 个 Markdown，未发现缺失文件链接 | 不包括所有网络链接、锚点及 npm 包内离线导航 |
| 重点风险复现 | fake ctx/fetch/credentials、注入时钟 | 未查询真实账户或改动 DSH profile |

首次使用 `npm --prefix <临时目录> ci` 时，npm 11.19.1 报临时目录名对应的锁文件错误；以该临时目录作为工作目录重试后，同一锁文件完成全部检查。**不将调用方式产生的错误归因于仓库，也不宣称锁文件版本漂移导致 npm ci 失败。**

本轮只增加审计/规范材料和研究索引，没有修改实现、工作流、版本、远端设置或发布包。未新增真机 UI、真实凭据写入、Kimi Code/Sub2API 活体返回或完整 DSH tarball 安装验证。

## 架构与文件组织

[宿主入口](../../src/index.ts)、[目标解析](../../src/host/targets.ts)、[客户端入口](../../src/client/index.tsx) 和 [共享配置](../../src/shared/config.ts) 形成清晰的宿主 / 浏览器 / 共享三层；测试基本与实现对应。[构建配置](../../tsdown.config.ts) 明确区分宿主 ESM 与浏览器模块工厂。提交预构建产物适配 GitHub 直接安装路径，不能照搬普通 Node 库“所有 dist 应忽略”的惯例。

值得保留：

- [适配器契约](../../src/host/sources/types.ts) 分开 request 与 parse，已有五个 Adapter，Seam 有实际变化支撑。
- [HTTP Module](../../src/host/read.ts) 集中请求、超时、镜像和错误分类；[调度 Module](../../src/host/refresh.ts) 集中成功间隔、去重和失败保留旧值。Interface 可注入 fetch、时钟和凭据，具有 Depth。
- [RPC Module](../../src/host/service.ts) 仅两个方法，隐藏内部调度；allSettled 隔离单源失败。
- [宿主清单](../../src/host/typert.ts)、[客户端 contribution](../../src/client/contribution.ts) 和 [产物测试](../../tests/build/bundle.test.ts) 使用真实平台校验器/registry。
- [配置归一化](../../src/shared/config.ts) 集中旧文档迁移、非法字段降级和范围约束，避免脏配置阻断启动。

最需要加深的 Module 是**有效轮询目标解析**。客户端、targets、入口、凭据候选和缓存各掌握一部分“provider 查询哪个账户”的知识；多个 Interface 逐次转抄字段，造成 apiKeyRef/pinned 丢失，客户端又独立猜测 source。

建议在现有目标解析 Seam 集中产生有效目标：provider 来源、source、mode、有效 endpoint、固定 endpoint 标记、credential ref 策略，以及不泄露密钥的身份/配置代次。请求和凭据描述消费同一结果，客户端通过 RPC 获取安全的 provider→target 映射。应替换分散逻辑，不再叠一层仅做透传的 Module。

`source:mode` 是**数据源级单账户假设**，不等同于账户身份。两条 OpenCode 路由共享账户时去重合理；不同实例/不同密钥不能仅因 source 相同就被认定同一账户。本报告不要求新增多账户功能，但应明确限制或提示冲突，并保证重新配置后不把旧值当成新身份有效值。

无需大改目录。贡献说明、问题模板、安全报告入口和格式检查是轻量协作改善，不是 npm/市场普遍硬要求。[shared RPC](../../src/shared/rpc.ts) 与 [host service](../../src/host/service.ts) 重复的线上类型宜集中以改善 Locality。结构化平台类型镜像不自动证明平台兼容，仍须真实契约/安装验证。

## 逐项发现

### A01 · P1 · 供应商级凭据覆盖没有进入真实请求

证据：[配置字段](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/shared/config.ts#L19)、[provider 解析](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/shared/providers.ts#L84)、[目标生成](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/targets.ts#L53)、[凭据装配](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/index.ts#L218)、[设置页保存位置](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/SettingsSection.tsx#L339)。

触发：高级设置将 apiKeyRef 设为 TEAM_KEY。目标类型/生成未携带该字段，宿主 optionsFor 只读旧 config.sources[sourceId].apiKeyRef。两把 fake key 均存在时，描述与请求仍使用 DEEPSEEK_API_KEY；仅配置 TEAM_KEY 则报未配置。

影响：指定凭据无效，可能查询错误账户；结合自定义 endpoint 时，可能发送与用户选择不同的密钥。底层字段与候选优先级测试未覆盖装配。

修复：让获胜 provider 的凭据策略进入有效目标；override → 该 provider 声明 → source 默认顺序由一个 Module 决定，描述与请求共用解析。补 provider 配置到 fake fetch headers 的集成用例：只有覆盖 key、两把 key 同时存在、描述/请求一致。密钥不得进入 RPC 身份字段。

### A02 · P1 · Moonshot 官方人民币余额被错误换算

证据：[金额转换](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/sources/kimi.ts#L26)、[解析](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/sources/kimi.ts#L70)、[测试](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/tests/sources/kimi.test.ts#L73)。[官方余额文档](https://platform.kimi.com/docs/api/balance.md) 明确 data.available_balance、voucher_balance、cash_balance 的单位是人民币元。

复现：同一官方 envelope，99.99 → ¥99.99，100 → ¥1.00，200 → ¥2.00。实现 `value >= 100 ? value / 100 : value` 与官方语义冲突。

修复：官方 Adapter 固定按元解析；其他网关若有不同单位，必须由其契约明确表达。替换固定启发式的测试，覆盖官方 envelope、0、99.99、100、100.01、大额/非法字段。源码“Verified against a real key”与含混文档也应对齐未真机验证现状；金额错误无需真实账户即可确定。

### A03 · P2 · 固定 provider endpoint 仍触发镜像请求

证据：[目标 pin](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/targets.ts#L65)、[入口装配](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/index.ts#L247)、[读取层](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/read.ts#L118)。

复现：providers.zai.baseUrl 固定 api.z.ai，首站 fake 401 后仍请求 open.bigmodel.cn。targets 保留 baseUrlPinned，入口却仅根据 legacy sources.baseUrl 设置 pin。

修复：透传有效目标 pin，明确 legacy/provider 覆盖优先级。读取层已有“不试镜像”测试，缺 entry 装配测试。

### A04 · P2 · 配置变更不隔离缓存和在途结果

证据：[目标 key](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/targets.ts#L20)、[缓存表](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/refresh.ts#L70)、[命中判断](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/refresh.ts#L110)、[写回](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/refresh.ts#L149)。

复现：A endpoint 成功读11，1ms后切B，普通refresh仍返回11且未stale；A请求在途时切B并force，也共享A并接受A结果。

修复：按有效身份/配置代次管理缓存和在途；身份变化后旧数值不能作为新身份有效值，旧 generation 完成不能覆盖新身份。补切 endpoint/ref、密钥轮换、在途 force/旧请求迟到。此问题独立于是否新增多账户。

### A05 · P2 · legacy models 绕过新版 provider 隐藏和覆盖

证据：[迁移保留 models](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/shared/config.ts#L240)、[旧目标先入调度](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/targets.ts#L83)、[provider 目标](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/targets.ts#L95)。

复现：旧 models 有 DeepSeek API，新 providers.deepseek.mode=hidden，仍生成 deepseek:api；同源改endpoint被旧目标吞掉，改source可能轮询新旧两个源。

修复：models仅作迁移输入，迁移后provider作为有效配置单一来源，或仅无新版entry时用fallback。补legacy+新版混合隐藏、改source/endpoint测试，不仅验证normalizeConfig输出。

### A06 · P2 · 刷新调度与配置/文档不一致

证据：[定时器只初始化一次](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/refresh.ts#L197)、[配置更新](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/index.ts#L192)、[浏览器30s轮询](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/index.tsx#L88)、[getState触发refresh](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/service.ts#L53)、[共识](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/docs/design-consensus.md#L77)。

实测：5min改1min并发volatile-update，实际timer仍300000ms。UI每30s调用getState、minInterval=60s时，0/30/60/90/120s请求累计1/1/2/2/3；浏览器打开且RPC成功时，空闲真实查询约每分钟发生，配置5min没有控制该行为。

修复：明确“读取快照”与“触发源刷新”的Interface，宿主统一调度，显式刷新可force；配置更新重调timer。若保留行为，准确解释浏览器轮询触发请求，不能把5min宣称为正常UI空闲频率。补完整时钟+RPC序列测试。

### A07 · P2 · DeepSeek 非法金额被当成正常零余额

证据：[默认0](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/sources/deepseek.ts#L31)、[成功写回](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/refresh.ts#L149)、[现有测试](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/tests/sources/deepseek.test.ts#L87)。

复现：balance_infos:[{currency:'CNY',total_balance:'bad'}] 被解析为正常0，可能覆盖旧成功值，违反“失败绝不造0”承诺。

修复：只接受有限数值，合法0保留，非法行跳过，无合法余额抛parse并保存旧值为stale。测试应区分真实零与缺失/非法字段。

### A08 · P2 · 客户端缺少宿主已有的端点解析信息

证据：[宿主endpoint hints](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/index.ts#L201)、[RPC不含映射](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/shared/rpc.ts#L30)、[设置页未传hint](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/SettingsSection.tsx#L385)、[状态行独立推断](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/StatusLine.tsx#L220)。

复现：id=custom-account，DSH endpoint为官方DeepSeek；带hint可解析，客户端实际无hint而unknown-source。宿主能查询，状态行仍显示未配置，高级页模式判断也可能错误。

修复：RPC传安全provider→target结果或非敏感hints，两端依同一身份展示/轮询。补普通id+官方endpoint、无需插件覆盖的完整用例，不能传密钥。

### A09 · P2 · 零配置供应商排序按钮无效

证据：[normalizeOrder](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/shared/config.ts#L213)、[排序函数](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/provider-rows.ts#L106)、[按钮调用](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/SettingsSection.tsx#L430)。

复现：默认order=[]，页面DeepSeek/z.ai两行；z.ai上移返回undefined。函数测试有已存顺序，未覆盖默认页面。

修复：按当前可见rows有效顺序交换，保存完整顺序；补默认配置、新provider未入order、混合自动/已存项的点击测试。

### A10 · P2 · 旧值存在时失败信息丢失，RPC断线可继续显示正常旧值

证据：[stale显示段](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/shared/display.ts#L165)、[tooltip](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/status-text.ts#L88)、[RPC失败](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/store.ts#L118)、[状态行错误分支](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/StatusLine.tsx#L230)。

复现：provider失败时保留旧值/⚠，但snapshot.error未进入parts，具体invalid key/offline不在tooltip；成功一次后RPC断线，catalog/snapshots保留且snapshot.stale未置位，状态行绕过state.error，继续正常显示旧余额。

修复：区分源失败与RPC传输失败，保留数字同时统一显示失败、年龄和原因。补“成功→源失败”和“成功→RPC失败”的整段展示/tooltip测试，不只是数字保留断言。

### A11 · P2 · 没有自动质量门禁和主分支检查要求

证据：[仓库API](https://api.github.com/repos/takboo/dsh-usage-state)、[工作流API](https://api.github.com/repos/takboo/dsh-usage-state/actions/workflows)、[rulesets API](https://api.github.com/repos/takboo/dsh-usage-state/rulesets)。本地无workflow；远端0workflow、rulesets=[]、main未保护。

影响：真实平台契约、安装、打包、产物一致性全靠本机执行。项目已出现平台契约破坏，自动门禁的价值高于更多只测函数输出的用例。

修复：免费标准runner上增加PR/main CI，稳定job设required check；是否强制review按协作情况决定，不给单维护者引入无法完成的审批。

### A12 · P2 · 预构建产物未强制与源码一致，缺失检查会skip

证据：[built/skip](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/tests/build/bundle.test.ts#L40)、[脚本](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package.json#L11)、[发布顺序](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/docs/release.md#L33)。本次客户端两处字符串不同；宿主/Typert相同。

影响：源码和产物测试可同时绿但测不同内容。手册先test后build，没有重建后正式产物门禁；一个必要产物缺失时，整组产物测试skip。

修复：正式路径build后test；必要产物存在、无skip、生成文件已跟踪且无差异。保留原始GitHub交付验证，CI不应自动提交漂移后当作成功。当前差异仅文案，不夸大成功能代码缺失。

### A13 · P2 · 发版元数据、Changelog与Git引用不同步

证据：[package0.4.4](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package.json#L3)、[lock0.4.1](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/package-lock.json#L3)、[0.4.4待发布](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/CHANGELOG.md#L7)、[比较链接](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/CHANGELOG.md#L73)、[tags](https://api.github.com/repos/takboo/dsh-usage-state/tags)、[releases](https://api.github.com/repos/takboo/dsh-usage-state/releases)。npm latest为0.4.4；远端无tag/release，仅main分支。

影响：已发版与记录矛盾，比较链接没有对应Git引用。lock版本漂移不阻止本次ci，但表明版本操作未统一。tag/Release不是npm硬要求，却对现有Changelog链接和版本追溯必要。

修复：同步package/lock根元数据、正式带日期版本条目、同版本tag/Release；检查tag、版本、日志和产物来自同一commit。修历史链接仅采用有确证commit的引用，不臆造发布点。

### A14 · P2 · 开发Node最低版本说明错误

证据：[中文README](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/README.md#L148)、[英文README](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/README.en.md#L124)、[hook](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/tests/support/client-render-hook.mjs#L2)、[tsdown要求](https://github.com/rolldown/tsdown/blob/v0.22.14/package.json)、Node官方[module](https://nodejs.org/api/module.html#moduleregisterhooksoptions)/[TypeScript](https://nodejs.org/api/typescript.html)。

复现：22.6无法导入registerHooks；当前tsdown要求^22.18.0 || >=24.11.0，不能用TS stripping首次引入版本作为开发下限。

修复：分别写运行产物与开发要求；开发采用22.18+的22线或24.11+的支持线并由CI验证。不能仅因开发工具而机械抬升运行engines；20.20.2本次只有产物加载冒烟。Node20已结束官方维护，保留支持需有维护策略/运行冒烟。可用版本文件/packageManager固定工具链。

### A15 · P2 · 当前文档与市场规范存在事实漂移

- [市场条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/takboo__dsh-usage-state.yml)仍写输入框下方；[PR6622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6622)仍open。已有欠账记录，不需重复PR。
- [发布文档](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/docs/release.md#L19)先说市场只读实时站点，后说中国区优先npm catalog；应按区域写明适用范围。
- 同文档把兼容判定写成engines优先/peer其次；当前实现组合engines与相关host peers约束，是conjunction。当前包一致，未证明今天因此拒装，但未来会误配。
- 同文档称每日约03:30Z；上游当前build-site schedule为02:23UTC，且schedule不保证准点，应链接工作流而不是固定保证时刻。
- [共识](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/docs/design-consensus.md#L82)称前端不定时拉取，实际30s；[类型注释](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/context.ts#L10)仍称0.1.5/旧engines；[状态行注释](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/StatusLine.tsx#L201)仍写下方；[开发脚本注释](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/scripts/dev-local.sh#L68)引用已删除实现文档。
- [扩展指南](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/docs/adapters.md#L3)说两个文件一行注册即可，但新provider自动识别还涉及shared hints；“未配置models就不显示”的排查沿用旧模型。
- README建议“请用0.4.1”容易误读，应改“至少0.4.1，建议最新兼容版”；Sub2API订阅路径还可输出1d/7d/30d，不宜只说5h/7d。

修复：正文仅保留当前行为，历史在修订日志；外部规范附来源commit/核验日期。本机cache权限、旧home路径保留为历史，不能作为所有贡献者前提。来源细节见[规范研究](repository-release-standards-2026-10.md)。

### A16 · P3 · 设置页异步写入与只读交互不完整

证据：[保存/清除](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/SettingsSection.tsx#L138)、[禁用输入](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/SettingsSection.tsx#L181)、[mutate](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/SettingsSection.tsx#L388)、[丢弃返回值](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/client/settings-form.ts#L41)。这是静态路径确认，未新增真浏览器点击验证。

set/unset处理ok:false但不捕获rejection；无pending防重复。writable=false禁用输入却未同样禁用Clear。void mutate无失败反馈，适配器丢弃结果；store的credentialsError未显示。

建议：按真实平台mutate契约保留结果，统一try/catch、pending、错误提示和writable。key/ref变化后更新描述和读数；补真实异步事件测试，SSR字符串无法覆盖。隐私应写“浏览器不从宿主读取已存密钥值”，用户主动粘贴的草稿必然暂存客户端。

### A17 · P3 · 响应体阶段网络中断误报parse

证据：[json catch](https://github.com/takboo/dsh-usage-state/blob/3ad9a71e2f7e4b9a05c69bc529e396a364ae6aeb/src/host/read.ts#L103)。fake响应头成功、json抛AbortError，被归parse/invalid JSON；真实流式fetch也可在body读取阶段超时。

建议：SyntaxError归parse；AbortError/TimeoutError/传输错误归network，补body阶段用例。fetch本身超时测试不覆盖此路径。

## 利用GitHub免费CI/CD

[官方计费文档](https://docs.github.com/en/billing/concepts/product-billing/github-actions)明确：公开仓库使用标准GitHub-hosted runner的Actions免费。无需按私有月度分钟额度缩减检查；larger runner仍收费，免费也不等于无限并发/运行时间。artifact默认90天、公有仓库可设1–90天，不适合作永久发布渠道。完整来源见[规范研究](repository-release-standards-2026-10.md)。

| 工作流 | 触发 | 内容 |
|---|---|---|
| CI | PR、main push、manual | npm ci、typecheck、build、test、产物一致性、tarball文件/入口、文档链接/元数据 |
| Release | 与版本一致的tag或明确manual release | 版本/tag/日志校验、验证最终产物、pack、从已验证tarball发布npm、GitHub Release与校验值 |
| Maintenance | 周期、Dependabot PR | 分组升级npm/action、advisory、DSH当前线契约冒烟；新平台线先检测不自动放宽engines |

建议主CI为Ubuntu+Node22.18+/24.11+；指定单个Node24 job严格比对产物，矩阵验证兼容。保留Node20运行声明时，只跑预构建JS冒烟，不要求在20上跑tsdown。macOS/Windows安装/路径冒烟可按发布或周计划执行，不必把所有任务放进大矩阵。

实施要点：

1. 锁文件安装，build后test；必要产物缺失失败，正式测试不能skip。
2. git diff --exit-code -- lib验证已跟踪产物，并检查lib中无未跟踪生成文件；不自动提交漂移消除门禁。
3. 验证tarball自身exports/main/patch/白名单/可加载性，不仅仓库目录。
4. 在最低支持DSH及当前支持DSH安装tarball冒烟，判宿主激活和真实RPC契约；fake数据即可，不需要真实付费key。视觉/活体测试仍有独立价值。
5. PR默认contents:read；发布job单独id-token:write；创建Release的contents:write限对应job。第三方action固定完整SHA，Dependabot维护。
6. concurrency取消被替代PR任务、有限timeout、短期保留必要tarball/失败证据，缓存npm下载缓存而不是node_modules。
7. required check用稳定job名；发布仅从可信引用执行，不给外部PR代码写入/发布权限。

[官方npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)适合此公开包：仓库/workflow绑定OIDC publisher，GitHub-hosted runner发布，无长期npm token。当前最低npm11.5.1、Node22.14；公开repo+公开包支持的OIDC路径自动provenance。当前npm还支持staged/direct publishing选项，首次配置须按所选发布方式设置allowed actions。维护者需一次配置包设置，本轮未改账号设置。

不要直接加prepare/prepack强迫安装者构建。DSH官方指南说明Git源prepare可能触发pnpm allowBuilds；保持预构建策略，发布验证放workflow/独立命令。生命周期钩子若要使用，先分别验证npm tarball及DSH pnpm Git安装，不能套普通npm库模板。

## npm/Node及dshmarket核验

| 领域 | 判断 |
|---|---|
| npm入口/内容 | main/exports有效；MIT、repository/homepage/bugs齐全；files白名单合理 |
| 运行依赖 | zod v4为真实dependency；平台共享schema为peer；浏览器React由模块表提供，不机械新增runtime peer |
| 平台manifest | bundle.patch、web client、inject齐全；patch id与设置namespace匹配；Typert named export有真实测试 |
| DSH兼容 | engines限定0.2且peer对应，有依据；应测真实下界/当前线，不因新版本自动扩大范围 |
| 发版 | 版本/日志/锁文件/产物须同步；OIDC/provenance是推荐，不是当前发布硬门槛 |
| 市场硬项 | 公开、满1天、dsh-plugin topic、dsh.bundle、有效条目，已核验项满足 |
| 截图 | [声明](../../screenshots.json)为3张本仓库路径，数量/形式合理；高级截图无密钥值 |
| 市场描述 | 已确认欠账为旧位置描述；已有PR仍未合并 |
| author/types/Release | 缺失不一概当npm/市场违规；types取决于第三方复用，Release改善追溯 |

市场不是所有GitHub仓库的自动索引；版本、npm repository映射、截图采集、条目描述分属不同链路，应分别验证。描述与源码相符优先于营销。共享平台实例包按官方指南用peer+dev，独立第三方运行依赖应留dependencies。

## 文档与维护补充建议

- 本地文件链接扫描通过，但tarball只发适配器文档，其内部指向未随包的Backlog/Research，Changelog也指向未随包的Release。离线安装目录导航不完整，可改仓库URL或说明主要在GitHub阅读，无需把全部研究材料装进包。
- README版本细节重复且过长，宜保留安装、当前行为、限制，历史链接Changelog；中英关键事实一起更新。
- 高级设置相邻span缺显式label关联；后续UI改动补无障碍命名、键盘和写入状态。固定CSS字符串的测试不等同所有字体/窄屏视觉验证。
- [外部状态hooks](../../src/client/hooks.ts)可改React原生useSyncExternalStore，处理快照读取与订阅之间竞争及store更换一致性。这是建议，未计入已复现缺陷。
- [开发脚本](../../scripts/dev-local.sh)默认一次性profile，但已设置DSH_HOME时会复用该home。“默认隔离”比“真实profile永远不受影响”准确；可用开发专用变量、路径检查/标记强化隔离。本轮未启动替代宿主。
- 历史本机路径可留作证据，常青流程应独立于某人的home、cache权限和安装位置；研究附日期、commit、verified/unverified级别。

## 实施顺序与验收

1. **请求正确性**：A01/A02/A03/A07。验收fake fetch实际凭据/endpoint策略、官方人民币字段、非法金额保留旧值。
2. **有效目标与配置代次**：A04/A05/A08；明确单源账户限制。验隐藏旧配置、切换时旧请求迟到、普通id+endpoint自动识别。
3. **调度与客户端**：A06/A09/A10及A16/A17。验完整时钟序列、零配置排序、RPC断线旧值状态、失败tooltip、异步写失败。
4. **CI和发版**：A11/A12/A13/A14。要求清洁安装、最终产物契约、一致性、tarball冒烟、正确开发Node下限、版本/Git引用同步。
5. **文档和市场**：A15，跟踪已有PR；确定事项归入既有Backlog，避免维护两份长期待办。

先保证当前承诺在配置变更、失败和发布路径中成立；第一轮无需增加成本统计、历史记录、OAuth或更多数据源。
