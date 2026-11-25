# 源码目录索引

本目录包含 `dsh-usage-state` 的全部 TypeScript / TSX 源码，经 `tsdown` 统一构建为根目录 `lib/` 下的三个预构建入口。架构职责与数据流详见 [架构与验证](../docs/architecture.md)，厂商扩展详见 [适配器指南](../docs/adapters.md)。

- [`index.ts`](index.ts)：Host 侧插件主入口，注册服务、配置项、事件监听与 Typert RPC 绑定
- `host/`：Host 侧核心逻辑，包含 provider 目录读取、凭据解析与回退、DeepSeek 账号服务读取、刷新调度、身份隔离缓存、Typert 清单与 `host/sources/` 各厂商数据源适配器
- `client/`：Client 侧 React 组件与模块加载入口，包含输入框上方状态行、插件行内配置页、草稿与表单适配、主题控件、插槽注册、本地轮询存储与双语文案
- `shared/`：Host 与 Client 共享的配置归一化、展示格式化、UTC 周期计算、provider 识别规则、RPC 契约与公共类型定义
