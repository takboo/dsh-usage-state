# 工作流与验证门禁

本仓库的本地开发门禁以 [`mise.toml`](../mise.toml) 为单一入口，并对齐 [`dsh-engineering.lock.json`](../dsh-engineering.lock.json) 锁定的共享工程基座契约。由于共享工程基座仓库当前为私有仓库，GitHub Actions 的公开 CI（[ci.yml](../.github/workflows/ci.yml)）运行不依赖私有检出的自包含 `npm` 门禁（含锁/外壳回归测试 `tests/build/engineering-shell.test.mjs`、`verify:artifacts` 与 `verify:package`），完整的基座 `check:shell` 在持有本地基座检出的开发环境经 `mise run check` 执行。

## 唯一真实门禁

首次进入工作树或依赖变化时先安装锁定依赖，再执行日常本地门禁：

```bash
mise trust
mise run setup
DSH_ENGINEERING_CHECKOUT=/path/to/dsh-plugin-engineering mise run check
```

`mise run check` 通过 `depends` 调度以下任务（需先 `build` 的任务已通过显式依赖串行约束，避免并发写 `lib/`）：

1. `check:shell`：调用锁定基座 `locked-run.mjs check-plugin`，校验版本锁、`mise.toml` 契约、根目录无打包残留、根 `.rgignore` 历史降噪、可安装 bundle 声明与全仓 Markdown 断链/索引（`E0`）。
2. `check:metadata`：`npm run verify:metadata`，校验 `package.json`、`package-lock.json`、Node/npm 版本声明、图标与双语 `locale/*.json` 元数据（`E0`）。
3. `typecheck`：`npm run typecheck`，执行 TypeScript 静态类型检查（`E0`）。
4. `test`：依赖 `build`，执行 `npm test` 全部单元测试与契约回归（含公开 CI 可运行的 `tests/build/engineering-shell.test.mjs`）（`E1`）。
5. `smoke:runtime`：依赖 `build`，执行本地预构建入口运行时冒烟（`E1`）。
6. `verify:package`：依赖 `build`，打包并校验发布白名单、图标、双语 `locale/*.json` 与包内 Markdown 相对链接（`E1`）。

执行真实宿主容器验证（需本机 Docker Linux 引擎与容器内 npm registry 访问）：

```bash
DSH_ENGINEERING_CHECKOUT=/path/to/dsh-plugin-engineering mise run verify:host
```

`verify:host` 通过三段串行 DAG `verify:pack` → `verify:host:container` → `verify:host` 运行：`verify:pack` 调用 [`scripts/verify-host-pack.mjs`](../scripts/verify-host-pack.mjs)，先以 PID 归属标记 `.in-progress.json`、活跃 `.dsh-locked-report-*` 检测与完成戳 `verified.json` 把关目标目录（默认 `.tmp/verify-host`，可用 `DSH_VERIFY_HOST_DIR` 隔离输出目录；因同一工作树共享 `lib/`，真正并发的 `verify:host` 须在独立 Git worktree 运行），仅对已写出 `verified.json` 的上一轮完整产物自动归档至 `runs/`，随后才执行 `npm run build`、`verify-package.mjs`（`E1`）并硬链接 `candidate.tgz`；`verify:host:container` 调用 `locked-run.mjs container all ... HEAD host-report.json`（`E2`）；最后 `verify:host` 运行 `--verify-report` 核对 `verification.json` 与 `host-report.json` 的同包 `sha256` 及 `sourceCommit` 一致并写入 `verified.json` 完成戳。若某轮中途中断留下未完成产物或失效标记，须先确认原 `mise run verify:host` 整条任务链已完全退出（含收尾 `--verify-report` 步骤，而非仅容器退出），再执行 `node scripts/verify-host-pack.mjs --archive-incomplete`（通过带 PID 归属的 `.recover.lock` 互斥保护；若恢复进程异常遗留 `.recover.lock`，确认无恢复进程后按提示手动删除再重跑）。

提交源码与预构建产物后，再执行 `npm run verify`（含对比 `HEAD` 的 `npm run verify:artifacts`）和 `git diff --check`。提交前因重建导致的 `lib/` 漂移属预期，不可绕过检查或为让检查变绿而自动提交。

## 证据等级与诚实边界

| 等级 | 含义 | 本仓入口与范围 | 边界说明 |
| --- | --- | --- | --- |
| `E0` | 静态契约与格式检查 | `mise run check:shell`、`npm run verify:metadata`、`npm run typecheck` | 不运行业务代码或打包安装，不能替代运行期验证 |
| `E1` | 宿主机单测、冒烟与同包元数据校验 | `npm test`、`npm run smoke:runtime`、`npm run verify:package` / `mise run verify:pack` | 使用假凭据/fetch/时钟；`verify-package.mjs` 负责对交给 `verify:host` 的**同一候选 `.tgz`** 校验 `locale/*.json`、`icon.svg`、白名单与包内链接 |
| `E2` | 隔离 Linux 容器真实宿主探针 | `mise run verify:host`（`locked-run.mjs container` + 基座 `verify-host.mjs`） | 实测目标 DSH CLI 允许/拒绝与 Chromium Web 行为，核对 `provenance`；基座 `verify-host.mjs` **不覆盖**包内 `locale/*.json` 与 `icon.svg`，须由 `E1` 同包校验补齐 |
| `E3` | 原生 Desktop / 来宾系统验收 | macOS Desktop / 隔离来宾实机复测，记录在 `docs/compatibility/` 与 [待办清单](backlog.md) | 不由容器或单测替代 |
| `E4` | 公开分发与渠道安装核验 | npm、GitHub Release、dsh-market 安装复核，见 [发布与验收](release.md) | 仅在正式发版后按渠道记录 |

交付报告必须如实区分本轮实际运行的最高等级，未实跑的 `E2` / `E3` / `E4` 项一律标为 `not-run`。

## 改动面与最小必跑验证矩阵

| 改动范围 | 必跑验证 |
| --- | --- |
| 文档、索引、`.rgignore` 或 `AGENTS.md` | `mise run check`、`git diff --check` |
| 工程外壳（`dsh-engineering.lock.json`、`mise.toml`、兼容性探针或目标） | `mise run check` + `mise run verify:host`（验证 `provenance` 与 CLI/Web 阶段） |
| Host/Client 业务源码、适配器、配置或 `locale/` / `icon.svg` | 先补回归，再运行 `mise run check`、`git diff --check`；提交后运行 `npm run verify`；涉及宿主契约/打包边界时补跑 `mise run verify:host` |
| 发版准备或宿主兼容矩阵升级 | 以上全部 + [发布与验收](release.md) 与 [兼容性监测](compatibility-monitor.md) 对应步骤 |
