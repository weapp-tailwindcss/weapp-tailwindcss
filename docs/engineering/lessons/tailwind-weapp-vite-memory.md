---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/postcss/test/style-result-cache-capacity.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-source-invalidation.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-invalidation-race.test.ts
verification:
  - claim: 原 head 的 weapp-vite HMR RSS 在正向与反向确认均违反原门槛
    kind: ci
    status: failed
    sha: 4ba9fd1bd8d52c01db4b806d0968bdee24272f4d
    environment: Ubuntu hosted CI，Node 22.23.3，pnpm 12.14.0
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39726991635/job/119654407179
  - claim: 候选变化与并发失效的定向回归通过，完整 compiler 测试通过
    kind: integration
    status: passed
    sha: 4ba9fd1bd8d52c01db4b806d0968bdee24272f4d
    environment: macOS arm64，Node 24.18.0，pnpm 12.14.0；该 SHA 加本次未提交修复
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/compiler --update=none
  - claim: 输出 AST 容量回归及 PostCSS 完整包测试通过
    kind: unit
    status: passed
    sha: 4ba9fd1bd8d52c01db4b806d0968bdee24272f4d
    environment: macOS arm64，Node 24.18.0，pnpm 12.14.0；该 SHA 加本次未提交修复
    command: CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none
  - claim: 修复的单次本地真实构建与 watch 对照通过原性能规则
    kind: integration
    status: passed
    sha: 4ba9fd1bd8d52c01db4b806d0968bdee24272f4d
    environment: macOS arm64，Node 22.23.3，pnpm 12.14.0；精确归档加四个产品文件 overlay，非正式 CI 验收
    command: node .tmp/run-4ba9-candidate-perf.mjs
  - claim: weapp-vite static 基线重新生成后禁止更新复跑通过
    kind: integration
    status: passed
    sha: 4ba9fd1bd8d52c01db4b806d0968bdee24272f4d
    environment: macOS arm64，Node 24.18.0，pnpm 12.14.0；该 SHA 加本次未提交修复，仅构建产物验证
    command: CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/weapp-vite-tailwindcss-v4.test.ts --update=none
---

# 候选扫描失效与 HMR 内存调查

## 症状

PR #1314 的 `4ba9fd1bd8d52c01db4b806d0968bdee24272f4d` 在 weapp-vite 分片失败。HMR 峰值 RSS 正向为 1423.883→1612.793 MB，反向确认为 1277.094→1454.313 MB；稳态分别增加 129.586 MB 和 139.223 MB。两轮均超过原有 5% 且 64 MB 门槛，保留失败而未再次重跑。该分片没有插件 timing 样本，不能用其他框架的 CSS timing 解释它。

## 根因与纠正

发现并复现了两个独立的生命周期边界问题。第一，编译器将候选 glob 命中与精确编译依赖变化共用同一个失效计数。修改 WXML 类名会重建 Tailwind 编译会话。现在分别记录候选与引擎 epoch：仅命中候选 glob 时仍重扫并重新生成输出，同时保留引擎；精确依赖和显式 root 优先重建，与输入列表顺序无关。来源配置还受独立指纹保护，compiled 扫描登记的精确依赖继续保守失效。提交只记录生成开始时的 epoch，避免生成期间的新变化被旧结果吞掉。

第二，样式结果 LRU 原来只计输入 Root 的来源快照，文本输入成本恒为 1，未计持有的输出 AST。现在计入两者的节点总量，保持 128000 节点预算。回归缩小测试预算，保留真实 LRU 与生产计算，验证淘汰、最近访问和本轮 Input 来源绑定。

不能把第二项写成本次约 177 MB 回归的根因：真实 watch 诊断中，两版本都只有两个缓存，输出共 3945 节点、约 175 KB 来源文本，远低于预算。额外的有界分配采样和终态 heap snapshot 也未观察到新增存活树；两端 PostCSS 对象数量一致，快照后 heapUsed 均约 300 MB。快照会触发 GC，采样包含已回收对象，这些仅用于排除假设，不是 RSS 性能验收。引擎失效修复消除了确定的重复构造；Ubuntu 的 RSS 失败是否消除，仍须看修复提交的正式门禁。

## 验证

先红后绿：旧实现的容量回归失败，候选失效回归 5 项失败。修复后 PostCSS 160 文件通过，1877 项通过、3 项既有跳过；compiler 32 文件、174 项通过。随后追加真实 WXML 文件创建、删除至空目录的 fresh compiler 对照，5 项通过。并发测试验证候选和依赖在生成途中再次失效，下一轮必须生成最新结果，释放次数保持正确。路径覆盖 POSIX、Windows 反斜杠、根目录与相对 base。两个受影响包构建通过。

本地独立归档固定 base 与 `4ba9` 加四文件 overlay，使用 Node 22.23.3、pnpm 12.14.0 和原 driver，各 3 次 build、3 次真实 watch HMR；不采样、不强制 GC、不改阈值。原规则通过：build median 2971.56→3112.25 ms（+4.73%），HMR P95 7515.30→6692.18 ms（−10.95%），median 6506.77→6607.68 ms（+1.55%），HMR 峰值 RSS 1396.09→1333.14 MB（−4.51%），稳态 1353.13→1309.73 MB（−3.21%）。该 macOS 单批结果不能代替 Ubuntu CI，也不能说明每项指标均变快。

`CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/weapp-vite-tailwindcss-v4.test.ts -u` 重新生成该项目 7 份 static 基线，内容与 Git 基线一致；审查无差异后用 `--update=none` 复跑，5 项通过。没有连接或重置微信 IDE。

持久[证据摘要](evidence/weapp-vite-candidate-invalidation-4ba9.json)保留原 CI 工件摘要、overlay 哈希、原始指标、诊断文件哈希与来源恢复记录。计时之后仅调整 handler 回调换行以满足 lint，产品逻辑不变；测试追加文件创建与删除，不属于性能 overlay。大日志与快照保存在本任务忽略目录，不把本机路径作为结论的唯一证据。

## 适用边界

本轮本地测试身份均为原 SHA 加未提交修复，不能当作原 head 已通过。修复提交推送后重新核对全部当前 head 检查。既有 RN served bundle、原生 HMR 因果链等全面验收缺口继续保留；本地全面预检仍被微信保护租约与 Android 空 UI 结构阻塞，未重置会话、设备或绕过门禁。总体状态保持 partial。

## 规则评估

不新增 AGENTS 规则。现有的失效边界、先失败回归、真实性能对照与证据分层规则已覆盖此次问题，新增可执行测试更适合约束后续维护。
