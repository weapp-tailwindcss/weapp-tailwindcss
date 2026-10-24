# Rollup 多目录监听的缺失文件恢复

## 首败与准确运行时

2026-10-24，PR #1316 的 `8f0d56a7b` 在 [Demo Watch Diagnostic run 40067923012](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/40067923012) 出现两份独立 Windows 首败：

- [job 120794961700](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/40067923012/job/120794961700)：`uni-app-vite-tailwindcss-v4 / cjs / file`。
- [job 120794961799](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/40067923012/job/120794961799)：同一项目的 `esm / file`；该 job 的 CJS 组合通过。

两份日志的真实 Node 都是 24.22.1。失败发生在 demo 启动前的 `pnpm test:demo:matrix`：`rollup-watch.test.mjs` 的 0、1、2、3 轮通过，删除文件并收到 ERROR 后发布 value 4，5 秒内没有新 BUNDLE_END，结果始终为 `undefined`。这不能描述为 Mpx 或 uni-app 产品 demo 的 watch 已经失败。

失败日志未打印 Rollup 解析路径。按该 head 的测试解析代码和冻结锁文件，实际映射为：

| 消费方 | Vite | Rollup |
| --- | --- | --- |
| uni-app-vite-tailwindcss-v4 | 5.2.8 | 4.63.0 |
| issue-uview-plus-cssentries | 7.3.6 | 4.63.5 |
| debug-uni-app-x | 7.2.7 | 4.63.1 |
| taro-vite-react-tailwindcss-v4 | 4.5.14 | 3.30.0 |

uni-app 失败不属于 Rollup 3。回归从这些消费方实际解析运行时，并在名称中显示 `rollup.VERSION`，不根据 demo 名称推断主版本。

## 根因与确定性复现

Rollup 4 的 bundled Chokidar 在 `_remove` 中只为 `_watched.size === 1` 的单目录情况建立文件恢复订阅。入口位于根目录、文件型 transform dependency 位于子目录时，删除后可能只剩入口句柄，没有任何订阅负责发现文件重建。构建失败路径再次 `add` 文件可能遮蔽这个缺口，但该异步路径不能成为底层订阅的所有者。

既有 Rollup 3 补丁已经包含明确的缺失文件 owner、父目录订阅与订阅就绪对账；Rollup 4 的三个补丁仅同步过节流和文件身份修复。此前 `rollup-recreation-*` 的公共 fixture 固定加载 Taro 的 Rollup 3，无法验证其他版本具有同样的恢复能力。

新增最小回归只选择 Rollup 的 Windows 分支，文件删除、原子重建、stat 和原生订阅均使用宿主真实 API；入口和数据文件位于两个目录。未改实现时，三个 Rollup 4 版本的 CJS/ESM 共 6 项在原 5 秒内收不到 create，Rollup 3 的 2 项通过。这证明缺失订阅的结构问题；原 CI 日志没有原生订阅时序，不能据此还原其中每个事件的具体先后。

## 修复边界

- 三个 Rollup 4 补丁补齐缺失文件 owner：先退出旧句柄，再建立目标文件的临时父目录订阅；订阅后对账，并仅在 `ENOENT` / `ENOTDIR` 时继续有归属的重试。
- 绑定成功、unwatch、close 都释放 owner、句柄及定时器；在途 stat 和已派发的旧回调必须核验原 owner 身份。
- `EACCES` / `EMFILE` 仍报告错误，不退化为缺失文件的永久重试。文件 stat 成功后、原生绑定前再次删除仍保留恢复责任。
- FileWatcher 登记复用文件系统身份，模块失效使用原始依赖 ID；重复构建保留依赖时不重复安装订阅，不依赖上层 unwatch/add 恢复。Rollup 4 原有的 `dev + ino` 身份判断继续保留。
- Rollup 3 补丁未改变。三个新 patch hash 通过 pnpm 生成；锁文件只替换对应 hash，未调整依赖版本或其他 peer 布局。

补丁仅属于本仓库冻结工具链，不随 weapp-tailwindcss 的 npm 安装发布。

## 本地证据与限制

本轮在 macOS / Node 24.18.0 完成：

```sh
pnpm install --frozen-lockfile --offline
pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-*.test.mjs --maxWorkers=1
```

全部 19 个 Rollup 回归文件、565 项通过；范围包括四版本 CJS/ESM、删除重建、原子替换、polling、订阅就绪、权限错误、关闭、定时器释放以及旧 owner 的异步结果。原 `rollup-watch.test.mjs` 的全部 12 个组合通过，5 秒断言保持不变。

本地选择 Windows 分支不等于 Windows 原生文件系统验收。仍需在整合后准确 head 上验证 Windows CI；未通过重跑旧 CI、增加超时、跳过组合或放宽产物断言取绿。

原始日志和红绿 JSON 作为当前任务的本地证据保留：`rollup-multiple-directory-red.json` 为 6 红 / 2 绿，`rollup-multiple-directory-green.json` 为新增与原端到端 watcher 共 20 项通过，`rollup-all-node24.json` 为全部 565 项通过。

当上游同时修复文件订阅身份、缺失恢复和生命周期后，先用实际 demo 解析版本运行所有 `rollup-*.test.mjs`，再评估删除相应冻结补丁；不能只按 Rollup 主版本或单目录用例决定移除。
