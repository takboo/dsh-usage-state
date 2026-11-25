# 文档索引

本目录按职责维护 `dsh-usage-state` 的现行文档与历史材料。按任务快速跳转亦可查阅 [文档导航](index.md)。

## 现行文档

- [工作流与验证门禁](workflow.md)：单一门禁 `mise run check`、容器宿主验证 `mise run verify:host`、改动面矩阵与 `E0`–`E4` 证据边界
- [开发指南](development.md)：工具链、本地隔离宿主迭代、配置表单与回归要求
- [架构与验证](architecture.md)：Host/Client 入口、身份隔离、刷新调度与验证层次
- [设计共识](design-consensus.md)：产品范围与有效设计决定
- [适配器指南](adapters.md)：各厂商数据源端点、单位/窗口语义与扩展步骤
- [平台说明](platform-notes.md)：DSH 宿主契约、版本兼容与运行约束
- [兼容性监测](compatibility-monitor.md)：上游 DSH 发现、精确矩阵检查与自动巡检流程
- [发布与验收](release.md)：打包、发版、CI 跟踪与安装核验
- [用户排查](troubleshooting.md)：无读数、凭据权限与登录异常排查
- [待办清单](backlog.md)：尚未完成真机/活体验证及暂缓跟踪项
- [文档导航](index.md)：按任务索引表与文档维护边界
- [设计修订迁移指针](design-changelog.md)：保留旧版 npm 包链接的历史迁移入口

## 专题与历史目录

- [共享工程基座试点](compatibility/engineering-pilot.md)：版本锁升级与共享 CLI/Web 容器验证记录
- [最近发布证据（0.4.17）](releases/0.4.17.md)：各正式版本 CI 与分发字节核验（同目录保留 `0.4.9`–`0.4.17`）
- [历史归档索引](archive/README.md)：带基线日期的旧调查与验收快照（默认被根 `.rgignore` 屏蔽）
- [旧研究迁移目录](research/README.md)：保留已发布包公开链接的迁移指针
