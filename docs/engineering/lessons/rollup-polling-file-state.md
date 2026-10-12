---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1288
baseline: 504f14b30a90f5ac47373378586bd304ef3ea4fa
regressions:
  - scripts/ci/demo-matrix/rollup-polling-identity.test.mjs
  - scripts/ci/demo-matrix/rollup-invalidation.test.mjs
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
---

# Rollup polling 的文件身份变化不能被时间过滤丢弃

## 症状

[Windows / Node 24 诊断](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38291594609/job/114952741232)在 `test:demo:matrix` 失败，尚未进入 Gulp 的三轮验收。uni-app 的 CJS 目录依赖已通过构建期间失效交接，最终保存 `value: 3` 却仍输出 `4`，预期为 `6`。现场没有 raw/stat 轨迹，不能断言该次 Windows 保存恰好保持相同 mtime，也不能从最终值直接推断缓存交接再次失效。

## 根因与纠正

沿实际 Rollup watcher 检查到一个可确定复现的前置缺陷：内置 Chokidar 的 polling 仅在 size 变化、mtime 增大或删除时分发；后续两个 `_handleFile` 分支还在 atime 大于 mtime 时，仅凭 mtime 变化放行。后置 `_emit` 已有五字段去重，却无法恢复此前被吞掉的事件。

持久回归在受监视目录外准备等长新文件，固定整秒 mtime，再真实 rename 到目标。raw 事件明确收到新 inode、相同 size/mtime 和本例设定的 atime，但旧实现始终没有目标 change；两个 uni-app CJS 目录用例在原 5 秒期限失败。等待实际 watcher ready，且不让临时文件事件替代目标文件变化。

Rollup `3.30.0`、`4.63.0`、`4.63.1`、`4.63.5` 的 CJS/ESM 均补齐 `dev/ino/size/mtimeMs/ctimeMs` 比较，作用于 polling 分发和两处 atime 过滤。保留删除条件、同状态去重、句柄恢复、目录传播和构建期间缓存交接。比较忽略 atime，没有新增 stat、轮询频率、句柄、等待或重试；ctime 元数据变化可能保守触发一次重编译。

在独立临时 Rollup `4.63.5` 副本中分别回退两层条件，验证它们各自必要：仅回退 polling 时两个 atime 分支都失败；仅回退后续 atime 过滤时等于 mtime 的用例通过，大于 mtime 的用例失败。均为 raw 已收到真实替换、change 为空。临时副本由 `TemporaryDirectory` 回收，没有修改已安装依赖。

上游原条件见 [Chokidar 3.6.0 polling](https://github.com/paulmillr/chokidar/blob/3.6.0/lib/nodefs-handler.js#L270)与[后续过滤](https://github.com/paulmillr/chokidar/blob/3.6.0/lib/nodefs-handler.js#L369)。[Chokidar #1335](https://github.com/paulmillr/chokidar/pull/1335)讨论 atime 等于 mtime 的重复事件，未合并且没有修复文件身份过滤；已合并的 [Rollup #6526](https://github.com/rollup/rollup/pull/6526)处理 watch run 并发、hook 和错误恢复，也不能作为本缺陷已修复的证据。本次核对未找到已合并且覆盖精确复现的上游修复。

## 验证

本地 macOS / Node 24.18.0 / pnpm 12.9.1，在上述基线加本轮未提交修复的 worktree 执行：

- `CI=1 pnpm test:demo:matrix`：43 文件、298 项通过，入口固定 `--update=none`。
- `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-polling-identity.test.mjs --update=none`：24 项通过，覆盖实际框架解析的三个版本、CJS/ESM、文件/目录及 atime 等于/大于 mtime；raw 同时确认所设置的 atime。
- Node 22.22.3 的新 polling 与既有 invalidation 两文件：39 项通过。
- `pnpm install --frozen-lockfile --offline` 与定向 ESLint 通过。四个精确新 hash 的安装目录，CJS/ESM 文件逐字匹配重建补丁；未修改的缓存交接文件与旧补丁逐字相同。
- 锁文件只替换四个补丁的 SHA256，分别为 165、3、3、291 处；逆替换后与基线锁文件逐字相同，无依赖版本变更。

两个独立回退实验日志保留在忽略的 `e2e/.artifacts/issue-1286-ci/rollup-polling-patches/old-atime-filter.log` 和 `old-polling-filter.log`。首次 Windows 失败仍保留，新的 Windows/Linux 提交验收待 PR 当前 head 的 CI，不能把本地修复复现写成已证明远端现场的精确 stat 状态。

## 适用边界

补丁仅影响本仓冻结安装的开发依赖，不随公开 npm 包安装，无公开包 change intent。没有修改 demo 或样式产物，不需更新 static 基线。本地定向脚本矩阵不能替代本地全仓、全端或 IDE/设备视觉验收。

升级时须用框架实际消费的无补丁版本通过新 polling identity、既有 inflight、文件/目录依赖、CJS/ESM、连续原子保存、删除重建与路径身份回归，确认其余旧补丁也被覆盖后，才删除对应精确版本 patch 与锁文件登记。版本升级或 #6526 合并本身不是移除条件。

## 规则评估

不新增 AGENTS。用真实 raw/file stat 与逐层回退的因果验证补足现有边界，保留严格事件期限，不通过改写文件内容、拉长 mtime 间隔或增加构建等待隐藏前置漏报。
