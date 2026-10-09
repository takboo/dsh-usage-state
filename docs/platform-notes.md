# 平台说明与版本证据

本文件记录DSH相关契约、历史实验和厂商兼容观察。每条只对注明的版本/来源成立；它们不是所有未来宿主的永久规则。当前设计见 [设计共识](design-consensus.md)，开发操作见 [开发指南](development.md)。

主要历史环境为DSH0.1.5-rc.2与0.2.0-rc.2；来源见 [Typert研究](research/typert-rpc-minimal-contract.md) 和 [修订17–23](design-changelog.md)。2026-10-08官方文档复核见 [规范研究补充](research/repository-release-standards-2026-10.md#documentation-recheck)。本轮没有重新启动这些历史宿主。

## 1. 宿主RPC服务绑定

历史调查及当前产物测试要求typertRemote.service指向服务对象本身，serviceKey是注册名，namespace匹配线上命名空间。把service写成字符串会导致gateway/binding-invalid。

依据：[当前绑定](../src/index.ts)、[产物测试](../tests/build/bundle.test.ts)、Typert研究；契约在当前0.2依赖测试中验证。

## 2. 宿主codec

当前manifest使用zod v4，validator检查对应codec/schema形状，zod需为运行dependency。仅仅让对象长得像manifest不足以保证loader接受。

依据：[宿主清单](../src/host/typert.ts)、[真实validator测试](../tests/host/typert.test.ts)。平台升级应重复该契约测试，不把某个内部字段视作永远不变。

## 3. RPC参数个数

历史Typert协议按参数个数匹配。可选force仍显式传值或undefined，并声明acceptsUndefined；省略与明确undefined不能未经验证等同。

依据：[客户端贡献](../src/client/contribution.ts)、Typert研究。

## 4. 读取自己贡献的命名空间

历史Cordis环境下ctx.remote.<ns>属性访问要求inject；remote.usageState由本插件挂载后才出现，因此用ctx.get读取，避免依赖自己尚未贡献的服务。

依据：[remote helper](../src/client/remote.ts)、[客户端测试](../tests/client/remote.test.ts)、修订7。挂载失败必须可见，见第10条。

<a id="module-resolution"></a>

## 5. profile安装与外部link的依赖解析

**历史实测：2026-10-05、DSH0.2.0-rc.2。** 当时探针tarball装进profile可解析schemastery；profile外link探针未通过同一回落，报ERR_MODULE_NOT_FOUND。本仓库有开发schemastery，link冒烟因此可能假绿。

**官方文档补充：2026-10-08固定commit核验。** [发布指南](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/user/develop/basic/publish.md)描述了peer查找与link所在目录的lookup规则，不能扩写成“所有link一律无平台回落”。需要共享平台实例的包用peer+dev，独立第三方及无状态utilities可放dependencies。

当前验证要求：用tarball在独立home安装，避免工作树开发依赖掩盖真实分发问题。link用于迭代，不能替代该检查。历史观察保留，具体解析以本次被测宿主和安装位置为准。

<a id="client-hmr"></a>

## 6. patch、产物重建与HMR

历史0.2环境的bundle patch在启动时读取，宿主加载的代码/清单变更需要重启。客户端热替换依赖活跃client-hmr传输、宿主实际读取的bundle被重建、浏览器SSE接收通道正常。

官方依据：[client-hmr说明](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/hmr/README.md)。默认stat轮询500ms是该版本实现，不是跨版本保证。

本插件 [tsdown配置](../tsdown.config.ts) 同时包含宿主和客户端；npm run watch不是只构建client。外部link可用自己的watcher重建已链接产物；DSH自身源码开发按它的dev:web/watchers流程重建对应内容。仅有HMR receiver不保证保存立即生效。热替换会重挂载插件，React本地状态可能丢失；shell改动不走第三方client工厂替换链。

## 7. Node类型剥离和测试hook

本仓库测试靠Node原生TS stripping运行TS，TSX由 [hook](../tests/support/client-render-hook.mjs) 调用TypeScript转译。strip-only不支持TSX、构造器参数属性及需要转换的enum，也不做类型检查；typecheck仍需独立执行。

registerHooks在22.15/23.5引入，22线stripping在22.18默认启用；tsdown另要求^22.18或≥24.11。Node22.6无法启动当前hook，开发下限不能据最初stripping版本推断。详见 [官方版本研究](research/repository-release-standards-2026-10.md)。

## 8. 浏览器UI包的Node测试

浏览器primitives包含CSS等模块，其发布形态不适合直接作为普通Node模块运行。当前SSR测试通过hook替换本地桩件。

依据：[render测试](../tests/client/render.test.ts)、[primitives桩件](../tests/support/primitives-stub.mjs)。SSR验证初始标记，不运行浏览器布局。新增 [React交互测试](../tests/client/interactions.test.ts) 覆盖真实hooks/effects下的按钮、只读、pending、失败和草稿事件；仍使用外部服务桩件，不等于真实浏览器或凭据落盘验收。

当前ConfigForm写入返回Promise<boolean>，false是未接受写入而非成功；[表单适配器](../src/client/settings-form.ts) 把false转换为失败反馈。凭据与配置权限分别控制，不能把一个只读状态外推另一项。

宿主Config的volatile要求对应schemastery真实下界3.18.3，peer/dev已更正，锁解析3.18.4。旧3.18.2不具备该能力；预构建冒烟安装真实schema，不注入polyfill来证明虚假的下界兼容。

## 9. 厂商观察：z.ai错误信封与区域

历史真实账户观察：z.ai可用HTTP200 + success:false/code1000/msg表达鉴权失败，国内open.bigmodel.cn和国际api.z.ai的key不能混用。该路径属于厂商兼容观察，不是DSH平台规则。

依据：[z.ai实现](../src/host/sources/zai.ts)、[上游/真机研究](research/dsh-cost-meter-analysis.md)。Unreleased已由入口和读取层共同保留显式pin，[A03](backlog.md#a03) 的401不镜像回归通过；npm0.4.4仍是旧装配。历史厂商观察不等于本轮新增了真实账户验证。

## 10. 客户端codec工厂和RPC挂载

**DSH0.2契约。** 非src-json的codec需要create()工厂。0.4.0客户端漏此字段，宿主可激活却没有RPC读数；历史0.1.5校验面更小，不能据旧挂载成功推断0.2兼容。

依据：[贡献测试](../tests/client/contribution.test.ts)、[产物测试](../tests/build/bundle.test.ts)、修订18。两条测试都用真实0.2 registry解析endpoint，且挂载rejection记录错误。完整浏览器RPC往返仍应在安装验收中观察。

<a id="session-events"></a>

## 11. 0.1.5外部会话事件的历史限制

**历史实验：2026-09-21，dsh-session与persistence均0.1.5-rc.2。** 未知事件只有带ignorable:true才可安全读取，而当时Session.append未透传该标记：写入成功，后续validateStoredEvents却拒绝重建。手工补标记能通过，表明缺的是受支持写入口。

历史复现摘录，需使用同版本平台包，不是当前项目的通用测试命令：

```js
const { Session, SessionId } = await import('@deepseek-ai/dsh-session')
const { validateStoredEvents } = await import('@deepseek-ai/dsh-session-persistence')
const session = Session.create(SessionId('probe'), [], undefined, 0)
const event = session.append('usage-state/turn-usage', { probe: true })
validateStoredEvents(session.header, [event]) // 当时拒绝未知、非ignorable事件
validateStoredEvents(session.header, [{ ...event, ignorable: true }]) // 对照通过
```

依据：[修订8/13](design-changelog.md)。本项目不写会话日志的产品决定仍有效；不能把0.1实验直接说成所有0.2/未来版本都无法写事件。如未来讨论持久化，需要重新研究公开写侧能力及产品范围。

## 12. 槽位及可见性

历史观察：turnTail是单赢家chain，assistant-actions在回合动作条，旧回合动作条通常悬停才可见；它们不适合本项目常显的账户读数。0.2的composer.dock是原生统计/上下文计量器共排的一行pill，input.dock是输入卡片上方的list槽位。

当前只注册input.dock、order=200，排在平台queue之后；无模型选择或槽位zone未开放时可能没有读数。依据：[slots定义](../src/client/slots.ts)、[槽位测试](../tests/client/slots.test.ts)、修订13/19/20。平台字号和槽位变化需人工/契约复核，固定CSS测试不会自动发现上游改变。
