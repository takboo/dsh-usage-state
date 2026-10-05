# 发布与验收（Release）

> 面向"要发一个新版本的人"。这里是**常青流程**，不随版本积累记录——按版本的变更与验证结果记在 [CHANGELOG](../CHANGELOG.md)。平台行为类的事实见 [`platform-notes.md`](platform-notes.md)。

## 分发形态

同一份 `lib/` 供三条安装路径——npm 包 `dsh-usage-state`、`dsh plugin add github:takboo/dsh-usage-state`、本地目录。仓库始终带预构建产物，所以三条路都没有构建步骤。

`package.json` 的 `files` 白名单：`lib/`（`index.js` / `client.js` / `typert.js`）+ `cordis.patch.yml` + 两个 README + `LICENSE` + `docs/adapters.md` + `CHANGELOG.md`。改动白名单后**必须**用 `npm pack --dry-run --cache /tmp/npm-cache` 核对实际发布内容。

## npm 发布注意

- 本机 `~/.npm` 不可写时必须带 `--cache /tmp/npm-cache`：否则报 `EPERM`，而 npm 的提示会把它误导成 "cache folder contains root-owned files"（真实原因是写不进去）。
- `npm publish` 需要 2FA：非交互执行会以 `EOTP` 结束并给出 web-auth 链接，浏览器走完认证后再跑一次即可；有认证器可直接 `--otp=<6 位>`。
- 已发布包的 `repository` 必须指回本仓库——市场的 npm 映射靠它自动关联，条目 yml 里手写 `npm:` 会被校验拒绝。
- pnpm 12 对**刚发布**的版本有内置静置期（`minimumReleaseAge`），验证安装时可能装到上一版——显式写 `dsh-usage-state@<版本>` 即可，这不是故障。
- 版本号与 `engines.dsh` 区间的关系见 [`design-changelog.md`](design-changelog.md) 修订 14/16/17：每条边界都不能跨过未实测的发布线。

## dsh-market 收录链路（对 dshmarket 源码与 contributing.md 核对过）

1. 市场**不搜索** npm/GitHub，每次打开实时拉 `https://awesome-dsh-plugin.com/plugins.json`，**只允许安装列表内的来源**，并刻意不做本地快照兜底。
2. 列表由 `awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/*.yml` 生成（两个 README 是生成物，禁止手改）。收录 = 提一个 YAML 文件的 PR：`url` / `name` / `category` / `description.{en,zh}`，只有 `description.en` 必填；描述会被逐句对着源码核，必须属实、不带营销词；一个 PR 最多 3 条。
3. 硬性门槛：仓库声明 `dsh.bundle`（**只有** `dsh.client` 会被拒）、仓库创建满 1 天、仓库打 `dsh-plugin` topic。
4. 卡片上的 `DSH …` 徽标与兼容判定来自 **npm latest 清单**：`engines.dsh`（或 `dsh.engines.dsh`）优先，其次同版本线的 `@deepseek-ai/dsh-*` peerDependencies；两者都没声明（或没有 npm 包）→ 状态 unknown。市场对 `engines` 是**硬判定**，对 peer 的 caret/tilde 上限反而宽容。
5. 截图可选，放在**本仓库**的 `screenshots.json`（1–8 张，路径相对该文件，或 GitHub 托管的 https）；不声明则市场从 README 自动抽取。截图声明不需要再提 PR——市场下一次 nightly 构建会自行采集。
6. **"站点里有" ≠ "市场里能搜到"**：中国区市场优先读 npm 包 `dsh-plugin-catalog`（**每日 ~03:30Z 构建**，版本号里就是条数），实时站点只是回退。收录合并后当天在中国区可能搜不到，次日构建后才可见；`全球` 区读实时站点，立即可见。自检要同时查两边。

## 端到端安装验证（发布前必跑的六步）

> 背景（修订 16/17 的两次翻车）：**旧版复核只验"入口在 `__DSH_BOOT__` 列表里"，而 pending 的入口同样在列表里**——0.3.2 就是这样把"启动崩溃"验成了"通过"。下面六步的判据是"入口**激活**"。宿主半边改动的冒烟**必须装 tarball**，不能 `add "$PWD"`（link）：链接装的插件没有平台模块回落，而本仓库自带 `node_modules/@deepseek-ai/schemastery`，会让冒烟假绿（见 [`platform-notes.md`](platform-notes.md) 第 5 条）。

```bash
# 1) 类型与单测对上界：devDeps 的 @deepseek-ai/* 必须钉在受支持的下界
#    （本机 ~/.npm 不可写，必须带 --cache）
cd <repo> && npm install --cache /tmp/npm-cache && npm run typecheck && npm test && npm run build

# 2) 真机装配 + 启动（DSH_HOME 指到 /tmp，不动用户 profile）
#    第 1 条会建好 profile 并直接启动；确认建立后 Ctrl-C 即可
DSH_HOME=/tmp/dsh-home-verify "$DSH" --profile p --from-default-profile web --dump-config
#    必须装 tarball，不能 add "$PWD"（link）：链接装的插件没有平台模块回落，
#    而本仓库自带 node_modules/@deepseek-ai/schemastery，会让冒烟假绿（见 platform-notes 第 5 条）。
npm pack --pack-destination /tmp --cache /tmp/npm-cache
DSH_HOME=/tmp/dsh-home-verify "$DSH" plugin --profile p add /tmp/dsh-usage-state-<version>.tgz
DSH_HOME=/tmp/dsh-home-verify "$DSH" --profile p --dump-config   # 期望 - id: usage-state / config: {}

# 3) ★ 宿主侧激活判据：启动 stderr 不允许出现任何激活告警
DSH_HOME=/tmp/dsh-home-verify "$DSH" --profile p --port 3081 > /tmp/boot.log 2>&1 &
grep -E "did not activate|startup failed" /tmp/boot.log   # 期望：无输出
#    宿主的 auditStartupEntries 会在任何条目 pending/failed 时打
#    "dsh: warning: N entry did not activate"，所以"无输出"就是宿主半边真的挂上了。

# 4) 客户端入口进图 + 产物可取回（带 token 取首页，解析 __DSH_BOOT__）
TOKEN=$(grep -o 'token=[A-Za-z0-9_-]*' /tmp/boot.log | head -1 | cut -d= -f2)
curl -s -L -c /tmp/c.txt -b /tmp/c.txt "http://127.0.0.1:3081/?token=$TOKEN" -o /tmp/page.html
curl -s -L -c /tmp/c.txt -b /tmp/c.txt -o /tmp/served-client.js \
  "http://127.0.0.1:3081/plugins/??dsh-usage-state/client.js&rev=<boot里的rev>"
#    期望：page.html 的 __DSH_BOOT__.entries 含 dsh-usage-state（模块表 inject 四项原样），
#    且 served-client.js 返回 200 —— 注意这两条**单独不足以**判定兼容。

# 5) ★ 客户端侧激活判据：把真实产物放进假模块表跑一遍 apply
#    运行 tests 之外的一次性 harness（本次用的那份见修订 17 的验证段）：
#    window.__ModuleLoader__.load 捕获 factory → 用 react / react/jsx-runtime /
#    @deepseek-ai/dsh-client-ui-primitives 三个 stub 调用 → 断言
#    exports.inject 的**服务名**（不是包名）齐全，再拿假 ctx 调 apply() 不抛异常。
#    期望：inject = ["slots","locale","configForms","remote","remote.session","remote.credentials"]，
#    apply 依次注册 effect、configForms.get("usage-state")、remote.$mount(contribution)。

# 6) 服务名双向核对：宿主/客户端确实提供了 inject 里的每个名字
#    客户端侧：grep 'super(ctx, "configForms"' 等；宿主侧：auditStartupEntries 的告警为空（第 3 步）
#    平台自己的同类插件是最快的参照：@deepseek-ai/dsh-client-locale 的 client inject 也写 configForms。
# 7) ★ RPC contribution 契约：拿真实 registry 校验（0.4.0 就是在这里漏的）
#    入口"激活"只证明 cordis 服务注入成功；remote.$mount() 是另一条契约。
npm test                     # 内含两条：tests/client/contribution.test.ts（源码）
                             # 与 tests/build/bundle.test.ts（构建产物 lib/client.js）
                             # 都把 contribution 注册进真实的
                             # @deepseek-ai/dsh-typert-registry/client 并要求 endpoint 可解析。
#    真机再加一道：取宿主实际发出的产物，塞进假模块表 + 真实 registry 跑 apply()
curl -s -L -b c.txt "http://127.0.0.1:<port>/plugins/??dsh-usage-state/client.js&rev=<boot里的rev>" -o served.js
#    期望：apply() 走到 "mounted"，usageState/getState 可解析，且 console.error 为空。
#    （harness 见 tests/support/browser-face.mjs：loadBrowserFace / realRegistry / shellModuleTable）
```

## 人工验收清单（重启 DSH 后逐项确认）

安装或改动宿主半边后，重启 DSH（bundle patch 只在启动时读取），然后按此表确认。只有 DeepSeek 凭据时，第 3–5 步先只能验它。

| # | 操作 | 期望 |
|---|---|---|
| 1 | 打开设置 → 侧边栏出现「用量状态」 | 页面可打开；中英跟随 DSH 语言设置切换 |
| 2 | 供应商列表 | 列出 DSH 里配置的供应商（每行含其模型清单）；DeepSeek 显示「自动识别为 DeepSeek · API balance」 |
| 3 | 保持默认「自动」（或点「API balance」） | **输入框上方**出现独立一行 `DeepSeek · ¥余额`（与输入卡片同宽；卡片下方那排原生统计不受影响） |
| 4 | 点「立即刷新」 | 数值与时间戳更新 |
| 5 | 故意用错误密钥（或在设置里清掉） | 保留上次成功值 + `⚠`（多久之前），悬浮显示原因；**不显示 0 或空白** |
| 6 | 配置 z.ai / Kimi / Sub2API | 出现「数据源 / 接口地址 / 凭据名 / 密钥」区块；填入后 coding-plan 模式显示 `◔ 5h x% (倒计时) · ◔ 7d y%`（每个窗口前置 SVG 圆环，几何同平台 `ContextMeter`） |
| 7 | 改显示设置（阈值、进度环、刷新间隔） | 立即生效；**把黄色阈值临时改成 10** 可确认阈值变色（读数与圆环同步变为琥珀色，≥红色阈值变红——高阈值视觉至今无真机样本，见 [`backlog.md`](backlog.md)） |
| 8 | 悬停任意一段文字 | 出现悬浮提示：数据源 + 模式（+ 窗口绝对重置时刻 / 余额赠送与充值构成 / 失败原因） |
| 9 | 供应商名字很长时（如 `opencode-go-ds41` / `opencode-go-deepseek`） | 卡头部**不换行**：`↑ ↓ 自动 Coding Plan 隐藏` 始终与上一行同一右边界；被截断的灰色 id 悬停可看全文（`title`） |

出问题时的恢复命令：`dsh plugin --profile web remove dsh-usage-state`。
