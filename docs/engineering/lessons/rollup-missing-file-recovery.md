---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 8f0d56a7b355a86fc11a9f23748ae88e8f7adb90
regressions:
  - scripts/ci/demo-matrix/rollup-recreation-multi-directory.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-lifecycle.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-readiness.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-error.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-owner.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-timer.test.mjs
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
  - scripts/ci/demo-matrix/rollup-hierarchical-ownership.test.mjs
  - scripts/ci/demo-matrix/rollup-watch-groups.test.mjs
  - scripts/ci/demo-matrix/rollup-directory-retirement.test.mjs
  - scripts/ci/demo-matrix/rollup-directory-errors.test.mjs
  - scripts/ci/demo-matrix/rollup-close-errors.test.mjs
---

# Rollup 多目录监听的缺失文件恢复

## 症状

2026-10-24，PR #1316 的 `8f0d56a7b` 在 [Demo Watch Diagnostic run 40067923012](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40067923012) 出现两份独立 Windows 首败：

- [job 120794961700](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40067923012/job/120794961700)：`uni-app-vite-tailwindcss-v4 / cjs / file`。
- [job 120794961799](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40067923012/job/120794961799)：同一项目的 `esm / file`；该 job 的 CJS 组合通过。

两份日志的真实 Node 都是 24.22.1。失败发生在 demo 启动前的 `pnpm test:demo:matrix`：`rollup-watch.test.mjs` 的 0、1、2、3 轮通过，删除文件并收到 ERROR 后发布 value 4，5 秒内没有新 BUNDLE_END，结果始终为 `undefined`。这不能描述为 Mpx 或 uni-app 产品 demo 的 watch 已经失败。

失败日志未打印 Rollup 解析路径。按该 head 的测试解析代码和冻结锁文件，实际映射为：

| 消费方 | Vite | Rollup |
| --- | --- | --- |
| uni-app-vite-tailwindcss-v4 | 5.2.8 | 4.63.0 |
| issue-uview-plus-cssentries | 7.3.6 | 4.63.5 |
| debug-uni-app-x | 7.2.7 | 4.63.1 |
| taro-vite-react-tailwindcss-v4 | 4.5.14 | 3.30.0 |

uni-app 失败不属于 Rollup 3。回归从这些消费方实际解析运行时，并在名称中显示 `rollup.VERSION`，不根据 demo 名称推断主版本。

## 根因与纠正

Rollup 4 的 bundled Chokidar 在 `_remove` 中只为 `_watched.size === 1` 的单目录情况建立文件恢复订阅。入口位于根目录、文件型 transform dependency 位于子目录时，删除后可能只剩入口句柄，没有任何订阅负责发现文件重建。构建失败路径再次 `add` 文件可能遮蔽这个缺口，但该异步路径不能成为底层订阅的所有者。

既有 Rollup 3 补丁已经包含明确的缺失文件 owner、父目录订阅与订阅就绪对账；Rollup 4 的三个补丁仅同步过节流和文件身份修复。此前 `rollup-recreation-*` 的公共 fixture 固定加载 Taro 的 Rollup 3，无法验证其他版本具有同样的恢复能力。

新增最小回归只选择 Rollup 的 Windows 分支，文件删除、原子重建、stat 和原生订阅均使用宿主真实 API；入口和数据文件位于两个目录。未改实现时，三个 Rollup 4 版本的 CJS/ESM 共 6 项在原 5 秒内收不到 create，Rollup 3 的 2 项通过。这证明缺失订阅的结构问题；原 CI 日志没有原生订阅时序，不能据此还原其中每个事件的具体先后。

### 恢复状态的所有权

- 三个 Rollup 4 补丁补齐缺失文件 owner：先退出旧句柄，再建立目标文件的临时父目录订阅；订阅后对账，并仅在 `ENOENT` / `ENOTDIR` 时继续有归属的重试。
- 绑定成功、unwatch、close 都释放 owner、句柄及定时器；在途 stat 和已派发的旧回调必须核验原 owner 身份。
- `EACCES` / `EMFILE` 仍报告错误，不退化为缺失文件的永久重试。文件 stat 成功后、原生绑定前再次删除仍保留恢复责任。
- FileWatcher 登记复用文件系统身份，模块失效使用原始依赖 ID；重复构建保留依赖时不重复安装订阅，不依赖上层 unwatch/add 恢复。Rollup 4 原有的 `dev + ino` 身份判断继续保留。
- 初轮只更新三个 Rollup 4 补丁，Rollup 3 保持原状；随后独立审查暴露四版本共有的父子订阅与清理问题，追加修订同时覆盖四版本 CJS/ESM。补丁 hash 由 pnpm 生成，锁文件只替换相应 hash，不调整依赖版本或其他 peer 布局。

补丁仅属于本仓库冻结工具链，不随 weapp-tailwindcss 的 npm 安装发布。

### 父子订阅、历史 ignore 与退役

Chokidar 的 `unwatch(parent)` 会保留屏蔽父目录及子树的 ignore；即使子文件仍登记或再次 add，也不能恢复通知。反向移除子文件同样会屏蔽仍有效的父 transform 目录所需事件。只按完全相同路径计数不能表示这两种所有权。四版本 CJS/ESM 的真实文件回归先得到 32 个失败，覆盖父退役子保留、子退役父保留，以及退役后新增父或子的历史 ignore 污染。

FileWatcher 保留原始模块 ID 的 alias，并将互不包含的订阅根放入同一物理组；父子冲突分配不同组。每组只派发自身活跃根的事件，普通目录按最近的普通来源角色去重，纯 transform 目录不能抢占源码事件。第一次撤销根后该组不再接纳新根，避免历史 ignore 污染新订阅；组内剩余根仍保留，最后一根退役即关闭该组。路径祖先计数索引用于登记和事件归属，避免初次登记随依赖数量形成平方扫描；已完成的关闭任务及时移除，物理组数量由活跃根约束。

撤销目录时释放所属子树的原生句柄、恢复 owner、扫描流和目录索引。在途 stat、目录处理和扫描读取经过异步边界后重新核对关闭状态及 ignore；迟到的 closer 直接释放，不能重新登记退役目录。新增异步回归确实复现了句柄拒绝后 `_watched` 仍复活的 8 个失败，因而不能只检查句柄数量。

### 完整扫描与失败释放

独立审查进一步固化三类真实实现失败：普通父目录的事件被纯 transform 子目录抢占；扫描发生 `EIO → close`、没有完整 `end` 时把部分列表当成完整快照，错误删除仍存在文件；第一个原生 closer 抛错后跳过同组剩余资源。这些故障使用真实 Task/handler 配合内存事件和故障注入，不冒充 Windows 文件系统验收。

只有完整 `end` 且订阅仍有效时才执行缺失文件对账；提前 `close` 只结束等待并清理引用。关闭和退役逐项尝试释放，单项失败不能跳过其余句柄、恢复任务、流或目录。异步 closer 立即接住 rejection，仅保留未完成任务，永久关闭排空后报告错误；FileWatcher 的结果经 Task 传给 Watcher，重复关闭复用完成结果。上层 close hook 和其他组仍需完成，不能只在组之间隔离失败而遗漏组内资源。

已完成任务的错误历史同样需要有界。审查在四版本双格式复现：128 次异步释放失败全部结束后，未完成集合为空，旧错误数组仍保留 128 个 Error。修订只保存首个错误与累计次数，任务完成即从等待集合移除；永久关闭时单错抛原 Error，多错使用 AggregateError，历史异步错误只保留首个，并以 `errorCount` 和消息报告总数。新增连续 24 次失败回归明确等待每次任务登记和完成；最初只等待一次事件循环的时序断言不准确，未计作红灯证据。修正后的回归在旧实现上八项均因仍保存 24 个 Error 失败，修订后通过。

## 验证

初轮多目录恢复在 macOS / Node 24.18.0 完成：

```sh
pnpm install --frozen-lockfile --offline
pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-*.test.mjs --maxWorkers=1
```

全部 19 个 Rollup 回归文件、565 项通过；范围包括四版本 CJS/ESM、删除重建、原子替换、polling、订阅就绪、权限错误、关闭、定时器释放以及旧 owner 的异步结果。原 `rollup-watch.test.mjs` 的全部 12 个组合通过，5 秒断言保持不变。

主树整合为 `a09ac33c3` 后再次完成冻结离线安装，并执行同一组实际展开的 Rollup 文件，19 文件、565 项通过、零跳过。主树独立按三个版本的前后 hash 反向核对锁文件，除这三个 hash 外逐字节相同；规则检查通过。一次把 glob 作为字面过滤参数的调用未选择任何测试，已保留该零项报告，不计作通过。

父子订阅与释放修订整合至 `d2d7d996022ccd3d19e4bd81b6110681387a2604` 后，主树重新完成 `HUSKY=0 pnpm install --frozen-lockfile --offline`，并在 `CI=1` 下执行：

```sh
pnpm --config.verifyDepsBeforeRun=false exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-*.test.mjs --maxWorkers=1 --no-file-parallelism --update=none
```

实际展开全部 24 个文件，733 项通过、零跳过；原删除重建的 12 个组合和 5 秒预算保留。主树报告为 `.tmp/framework-isolation/reports/rollup-ownership-integrated.json`。以 `c80cd1858` 的锁文件为比较基线，将当前四个 Rollup 补丁 hash 反换后，其他字节完全一致。首次核对脚本误用旧式嵌套 `hash:` 格式而未匹配，退出失败；按当前 pnpm 平铺条目格式修正后才通过，前次不计作成功。

本地选择 Windows 分支不等于 Windows 原生文件系统验收。仍需在整合后准确 head 上验证 Windows CI；未通过重跑旧 CI、增加超时、跳过组合或放宽产物断言取绿。

原始日志和红绿 JSON 作为当前任务的本地证据保留：`rollup-multiple-directory-red.json` 为 6 红 / 2 绿，`rollup-multiple-directory-green.json` 为新增与原端到端 watcher 共 20 项通过，`rollup-all-node24.json` 为全部 565 项通过。

## 适用边界

当上游同时修复文件订阅身份、缺失恢复和生命周期后，先用实际 demo 解析版本运行所有 `rollup-*.test.mjs`，再评估删除相应冻结补丁；不能只按 Rollup 主版本或单目录用例决定移除。上游背景沿用[原补丁记录](rollup3-file-recreation.md)，本记录不把仓库补丁与上游原版混为一谈。

## 规则评估

不新增 AGENTS。通过实际消费方版本登记和有归属的恢复生命周期回归补齐覆盖；没有 demo 或样式输出变更，无需更新 static 基线。补丁只影响开发工具链，不新增公开包 change intent。
