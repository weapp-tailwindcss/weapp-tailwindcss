---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1169
baseline: 828d4b1268595917e418278be6ed3d4971d7ae96
regressions:
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
  - scripts/ci/demo-matrix/rollup-invalidation.test.mjs
  - scripts/ci/demo-matrix/process-diagnostic.test.mjs
---

# PR #1169 的 CI 连续更新回归

Refs #1144。本文补充 #1144 修复提交后的 CI 证据，不代表 npm 5.5.2 已包含该修复。

## 症状

提交 `43ce0bff246d78b32bbc8c5ab55fcc68cbcdc598` 的
[PR Gate](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34204829762)
有两项实际失败，另有两个汇总门禁随之失败：

- macOS 分包 uni-app 用例全部测试通过，但 artifact 上传出现 `Upload progress stalled`；重跑同一任务后，测试和上传均通过。
- Windows Node 22 的 Mpx wx 用例在 production、initial、replace 通过后，于 add 编译期间以 0 提前退出。原日志没有给出退出原因，不能归因于 #1144，也不能认为退出码 0 代表 watch 验收通过。

增加同步记录进程启动、beforeExit、exit、未捕获异常、PID、内存和活动资源的诊断。
诊断没有保活定时器，不改变退出码，也不吞掉异常。三项进程回归分别检查自然退出、显式非零退出和未捕获异常。

提交 `828d4b1268595917e418278be6ed3d4971d7ae96` 的
[Windows 连续验收](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34215929992)
在 Node 22.23.2 和 Node 24 上各完成三次 production、initial、replace、add、restore，全部通过并上传完整报告。
这证明上述提交的六次完整执行成功，**没有证明首次提前退出的根因已经修复**。
该限制也补充了 `issue-1160.md` 中尚未归因的 Windows Mpx 退出记录。

## 根因与纠正

同一提交的 Linux 诊断任务和 demo 清单任务均在既有 `rollup-watch.test.mjs` 失败：第三次原子替换后没有新产物。
此时还没有进入 uni-app 的产品验收，不能写成 uni-app 编译失败。

在本机 Docker 的 Linux amd64 / Node 24.18.1 中，独立安装相同 Rollup 4.63.0 和仓库补丁复现。
保持 5 秒断言期限，将产物检查间隔缩为 1ms，让前一轮完成后立即保存下一轮。
日志确认两次变更间隔约 18ms，inode 和修改时间都不同，但内置 Chokidar 将第二次变更作为 50ms 窗口内的重复通知丢弃。

补丁继续保留 50ms 去重，只在 dev、inode、size、mtime 或 ctime 发生变化时开始新的去重记录。
同一文件状态的重复通知仍合并；没有添加轮询或延长测试期限。

修复通知丢失后，连续目录依赖测试还暴露出缓存交接问题：构建过程中收到的 transform 依赖失效先修改旧缓存，构建结束却用新缓存覆盖它，下一轮因此继续使用旧派生值。
Task 现在保留本轮收到的 transform 依赖失效，在交接新缓存时重新标记，并在下一轮开始消费时清空。
没有从构建输出反查源码，也没有增加构建后的文件系统扫描。

## 验证

- 新增去重回归检查相同状态只通知一次，五种状态变化都通知。
- CJS、ESM 各增加真实构建回归：暂停读取到旧值的 transform，在构建尚未完成时再次保存，确认收到失效后释放 transform；最终必须得到新值，并继续响应下一轮保存。
- 三项新增回归在旧补丁上全部失败；修复后通过。Linux 的快速连续替换、目录依赖、删除和重建共 80 次通过；最终两组持久回归共 7 项通过。
- 本地 `CI=1 pnpm test:demo:matrix` 共 41 项通过，使用既有 `--update=none` 配置；定向 ESLint 通过。
- `pnpm install --frozen-lockfile --offline` 通过。锁文件仅同步 Rollup 补丁的 SHA-256 引用；将新哈希还原后，锁文件与上个提交逐字一致，依赖版本没有变化。离线重新解析整个依赖图因本机缺少 registry metadata 失败的尝试未改变锁文件。

- `pnpm build:ci` 通过；`pnpm agents:check`、定向 ESLint、`git diff --check` 通过。
- 限定 `uni-app-vite-tailwindcss-v4:mp-weixin` 执行 `pnpm e2e:demo:matrix uni-app-vite-tailwindcss-v4:mp-weixin --update`，static 基线重新生成后无差异；再用 `CI=1 pnpm e2e:demo:matrix uni-app-vite-tailwindcss-v4:mp-weixin` 完成不更新基线的 production、initial、replace、add、restore 验证，全部通过。
- 曾误将首次 static 验证与包构建并行，读取尚在重建的 dist 时失败；构建结束后串行执行上述两轮通过。该次失败没有算作通过。冻结安装保留既有未构建 `wetw/dist/cli.mjs` 的 bin 提示，不影响退出码或上述验收。

## 适用边界

这两个补丁只用于仓库冻结安装的 Rollup，不会随 weapp-tailwindcss npm 包安装。将来升级 Rollup 时仍需验证并评估移除。
远端最终结果应以 PR 最新 head 的检查为准；排队、运行中和跳过的任务不作为通过证据。
## 规则评估

不新增 AGENTS 规则；根因通过持久回归约束。CI 必须检查最新提交的所有适用任务，不能将重跑成功写成根因已经修复，也不能把汇总门禁当作独立产品故障。
