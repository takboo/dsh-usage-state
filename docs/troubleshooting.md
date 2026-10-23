# 用户排查

适用于当前0.4系列。先记录插件版本、DSH版本及安装来源；GitHub浮动分支与同号npm包的内容可能不同。安装方式见 [README](../README.md)，尚缺验证见 [待办](backlog.md)。

## 先检查

1. 插件装在实际使用的web profile，DSH满足package的支持声明。
2. 安装或改宿主后已重启，插件未被启动恢复停用。
3. 当前会话已选择模型，provider未隐藏。
4. “设置→用量状态”中查看路由id、检测模式、来源和错误；区分账号登录与API Key。

## DeepSeek 两种身份

| 场景 | 处理 |
|---|---|
| `deepseek-account` | 保持自动或选择账号余额；在Harness账号设置登录。插件读取充值与赠送钱包，不要求填写API Key |
| 账号模式仍提示登录 | 确认Host提供 `deepseekAccount.getPlatformSession/getBalance` 且已有有效登录；旧宿主缺服务时需升级宿主 |
| `deepseek-official` | 保持自动或选择API Key余额；检查对应凭据ref和Key |
| 账号余额与API Key余额不同 | 两条路由按实际身份独立查询；确认比较的是当前模型的相应账户 |
| 切换模式后金额变化 | 账号模式与API Key模式使用独立缓存；显式选择的模式决定展示身份 |

## 其他问题

| 症状 | 检查与处理 |
|---|---|
| 设置页/状态行没有出现 | 核对profile、模型、隐藏设置及启动日志；开发安装先构建。无模型或槽位未开放时可不显示 |
| 一直读取中或remote挂载失败 | 检查客户端控制台/宿主日志。维护者按 [平台说明](platform-notes.md) 检查真实RPC贡献，入口存在不能证明已挂载 |
| API Key未配置，但模型可用 | 核对来源和ref；未知来源可显式选择，凭据服务可用后应采用宿主回答 |
| 提示缺接口地址 | Sub2API等自建源需要实例地址 |
| 密钥无效 | 核对产品及区域；z.ai国内/国际Key分开，OpenCode Go需要相应订阅；账号模式失效应重新登录 |
| Key输入框不可编辑 | 检查宿主返回的writable和来源。配置写权限与凭据权限分别判断 |
| 旧值及⚠ | 悬停查看年龄/原因。同身份失败保留旧值；换端点、ref、Key或登录身份会清旧值 |
| RPC断线 | 恢复连接后重试。旧数字只代表上次成功读数 |
| 金额或窗口异常 | 保留脱敏响应形状供维护者核对；余额按厂商主单位解析，只显示实际返回窗口 |

凭据优先级依宿主版本而异，见 [平台说明](platform-notes.md#凭据服务)。`env (direct)`/`file (direct)`表示插件使用了直接回退，不代表密钥被发送到浏览器。凭据文件位于所用DSH home，不一定是默认目录。

旧版问题与修复版本统一查 [Changelog](../CHANGELOG.md)。DSH0.1使用历史插件0.3.2；0.4.0有RPC挂载缺陷，应升级到最新兼容版。

## 恢复与报告

在目标profile执行 `dsh plugin --profile web remove dsh-usage-state` 并重启可移除插件；使用其他profile时换成实际名称。

[报告问题](https://github.com/takboo/dsh-usage-state/issues)提供插件/DSH版本、安装来源、provider id、模式、自定义端点与脱敏错误、复现步骤。账号截图只保留用量区域；密钥、登录grant、完整凭据文件和带token的URL留在本机。
