# 文档导航

接手本仓库从这里开始。当前源码版本由 [package.json](../package.json) 定义；已发布内容见 [Changelog](../CHANGELOG.md)，实际分发见 [GitHub Releases](https://github.com/takboo/dsh-usage-state/releases) 和 [npm](https://www.npmjs.com/package/dsh-usage-state)。工作树、已提交源码、CI通过和已发布是不同状态。

## 按任务阅读

| 任务 | 文档 |
|---|---|
| 安装、配置、功能与限制 | [中文 README](../README.md) / [English](../README.en.md) |
| 没有读数、登录或密钥问题 | [用户排查](troubleshooting.md) |
| provider、来源、账户和模式的含义 | [领域术语](../CONTEXT.md) |
| 修改代码、构建与测试 | [开发指南](development.md) |
| 找代码入口、理解身份和刷新流程 | [架构与验证](architecture.md) |
| 产品范围和有效设计决定 | [设计共识](design-consensus.md) |
| 扩展来源、核对金额与字段 | [适配器指南](adapters.md) |
| 宿主契约及版本边界 | [平台说明](platform-notes.md) |
| 上游 GitHub/npm 发现、兼容性检查与机器人 Issue | [兼容性监测](compatibility-monitor.md) |
| 提交、发版、跟进CI与恢复失败 | [发布与验收](release.md) |
| 尚未验收与暂缓事项 | [待办清单](backlog.md) |
| 核对正式版本CI与分发字节 | [0.4.10发布证据](releases/0.4.10.md) / [0.4.9](releases/0.4.9.md) |
| 追溯旧调查或决策 | [归档索引](archive/README.md) |

## 维护边界

- 当前文档描述现行行为，开放事项只放待办清单，已发布变更只放 Changelog。验证结果注明版本、环境和实际范围。
- `docs/archive/` 只在追溯历史或重新调查对应问题时读取；默认ripgrep搜索屏蔽归档正文，明确查历史时使用 `rg --no-ignore <pattern> docs/archive`。归档中的命令、旧路径、旧“当前状态”和建议实施顺序不作为接手指令。
- 依赖版本、脚本和支持声明以包清单、锁文件与工作流为准。常青文档不保存某次本机安装日志和临时路径。
- README、Changelog、适配器指南随 npm 分发。它们访问未随包文件时使用仓库 URL；仓库内开发文档使用相对链接。
- `docs/research/` 与旧设计修订地址只保留已发布包链接的迁移指针，当前阅读与默认搜索使用本导航和归档规则。
- 新事实更新对应职责文档；过时过程记录移出当前阅读路径，重复说明直接删除。归档保留来源、日期和适用版本。
