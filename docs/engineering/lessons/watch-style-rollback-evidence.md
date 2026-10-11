---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1282
baseline: afd51b8e4872e9fbe1c8acc3146ccda0a17efb99
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-style-rollback.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-wait-deadline.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-report-consumer.unit.test.ts
---

## 症状

准确 `afd51b8` 的 E2E Watch run `38137425883`、attempt 1 中，[macOS / Node 22 / demo-taro-vue3 default job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38137425883/job/114464063379) 的 GitHub 结论是 success，实际 runtime 为 macOS/arm64、Node 22.23.2。但 artifact `11703258234` 的 Webpack Vue style 记录为 `rollbackNeedleCleared: false`，热更有效耗时为 34240ms，回滚有效耗时仅为 13ms。

原日志在 13:03:59.334Z 开始 30 秒 marker 检查，13:04:26.495Z 构建仍处于 58%，13:04:29.726Z 转入 fallback，真实回滚编译到 13:04:38.292Z 才完成，随后打印 style passed。报告不能证明已清除回滚 marker。已有 dev/HMR 快照均早于此次 style 变更，没有 after-style/final 快照；同样不能据此认定最终产物持续残留。

## 根因与纠正

原 producer 在恢复源码后先检查 marker，再等待编译稳定。检查耗尽原 30 秒窗口后，宽泛 catch 吞掉错误并降级为一次耗时值，编译完成后没有补验 marker。它同时可能吞掉取消和业务进程退出。报告 consumer 还接受显式 false，subpackage-only 分派在相应断言前提前返回。这是验收生命周期及证据合同的缺口，不能通过放宽时间或把 false 解释为成功修复。

回滚从恢复源码的起点建立原 `timeoutMs` 绝对截止。先等待本轮编译稳定，再开启原 `min(timeoutMs, 30000)` marker 窗口，与总截止取较早值。后续轮询、稳定检查和 I/O 共用截止，不续借预算。共享等待在异步操作后重新检查取消、进程状态和截止，编译稳定检查将初始扫描纳入同一预算，并读取最新编译信号。

产物发现集中在内部扫描层，读取和 stat 单次执行，由外层轮询处理短暂缺失或文件锁。固定消费产物必须仍然存在；hash/glob 消费表达式允许合法更换文件名，须重新发现并验证当前集合。成功要求全部实际消费产物可读、没有此次唯一 marker，并且两次快照之间经过真实稳定检查，消费集合、mtime 和全文一致。异常、取消和缺证直接失败，不再产生 fallback 成功记录。

报告 consumer 在 profile 分派前检查实际存在的主包 style 和分包 style 指标，只有 `rollbackNeedleCleared === true` 才能通过；false 或字段缺失均拒绝。其它 profile 覆盖、轮次数、耗时及内存验收继续执行。

## 验证

源实现 `ededef284171a39d0b8a5e984c8d3a269fd6a973` 经独立只读审查，集成为 `6d7ba195a`。旧 producer 加旧等待实现的三项负向对照均因错误 resolve 导致断言失败，旧 consumer 的两项分包 false/缺证对照均因未 throw 失败，临时替换字节恢复已确认；不是导入或夹具初始化失败。

集成树的定向命令与结果：

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run --update=none test/watch-hmr-`：27 文件，首次 787 通过、1 个既有 Windows 专属条件跳过、1 条旧 Windows 脚本断言失败。持久采集函数已从静态变量赋值改为显式参数，断言却仍检查旧赋值文本。`0dd664d59` 将断言改为实际 `Get-WatchMemory -root 42 -repositoryRoot` 的路径参数合同；`CI=1 pnpm --filter weapp-tailwindcss exec vitest run --update=none test/watch-hmr-regression.unit.test.ts` 的 116 项复验通过。按最终文件结果汇总为 788 通过、1 条既有条件跳过，包含本次新增 19 项，不宣称首次整组命令通过。
- 修改及新增的 10 个实现/回归文件执行 `pnpm exec eslint --no-ignore` 通过。旧大型 regression 文件严格 lint 的 24 条历史问题未混入格式化。作者同一工具类型图比较为历史诊断 212→211，新增 0、移除 1；没有宣称完整工具类型检查通过。
- 真实 Vue mini style：`pnpm --filter @weapp-tailwindcss/scripts test:watch-hmr -- --case taro-webpack-vue3-tailwindcss-v4 --timeout 420000 --poll 40 --skip-build --quiet-sass --mini-program-only --style-only --max-hot-update-ms 420000 --max-plugin-process-ms 60000 --max-memory-rss-mb 5632 --max-memory-rss-delta-mb 4608 --max-memory-heap-used-mb 4096 --report <独占报告>`。热更 8761ms、回滚 8763ms，`rollbackNeedleCleared: true`；27 个有效 RSS 样本，peak 1344MiB、delta 941MiB。日志先完成回滚编译，再开启原 30 秒 marker 窗口，没有 fallback。
- 同一 `0dd664d59` 的两个真实 Web source CLI 分别使用 `--case taro-webpack-react-tailwindcss-v4` 和 `--case taro-webpack-vue3-tailwindcss-v4`，均带 `--web-only --skip-build --quiet-sass --timeout 600000 --poll 40 --max-hot-update-ms 600000 --max-plugin-process-ms 6000 --max-memory-rss-mb 5632 --max-memory-rss-delta-mb 4608 --report <独占报告>`。React 热更/回滚 2862/2764ms、29 个有效 RSS 样本、peak/delta 1634/1246MiB；Vue 为 2009/1420ms、17 个样本、1483/1031MiB。真实 DOM 替换、Iconify/content 与原预算通过，harness 显式 headless 并完成 awaited finally 收尾。

两项目全部被测源码 SHA256 恢复，mini 的 10 个已观测 PID 和 Vue Web 的两个已观测 harness PID 确认退出，两个 Web 的端口 10086 均清空。没有保留页面。此处 mini 验证仅 style 单链路，不替代 default 多轮或分包矩阵。仅 harness 的此次调整没有改变 demo 源码或样式输出语义；两个 demo 对应 static 已在此前配置修复限定重生成并禁止更新复验。

最终 hosted 验收仍待准确新 head，记录保持 `partial`。旧 artifact archive SHA256 为 `94d7e226e9ed51aefcd6c31c2d6dc71f8fb42b3be4e22c85e84b447c348e8f9f`，原报告 SHA256 为 `5c4af5b6056321d5977189ee0908fbbabe6f04647c8656e2be53901ba199443b`，保留失败证据而非重写旧报告。

## 适用边界

此处验证真实 Watch 产物，既不替代浏览器 DOM/计算样式验收，也不改变 bundler 生成逻辑。原 marker 窗口、总超时、性能门槛、case 范围和 CI 重试策略未放宽。本地只执行定向回归及指定真实链路，不作为本轮全仓或全端预检通过的证明，不操作微信 IDE 登录态。

## 规则评估

不新增 AGENTS 规则。持久 producer/consumer 回归约束错误传播、截止与证据完整性；已有工程流程已经要求区分 job 结论、实际产物证据和未证明的原因。
