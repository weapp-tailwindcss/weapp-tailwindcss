---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/148cebd6ce3584f5b2c930dd63639a0c3a5d47ee
baseline: 148cebd6ce3584f5b2c930dd63639a0c3a5d47ee
regressions:
  - packages/weapp-tailwindcss/test/js/oxc-semantic-parity.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-analysis-cache.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-parser.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-fast-path.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-js-processing.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-affecting-signature.unit.test.ts
---

# Oxc 条件语义与 raw transfer 验证

## 症状

Oxc 快速路径会把 `value === "w-[10px]" ? "h-[10px]" : "plain"` 的比较值也转义，Babel 则保留比较值。Vite production 默认选择 Oxc 时会暴露该差异。直接替换解析器、只比较速度，无法证明转换行为一致。

## 根因与纠正

- Oxc 的字面量事实缺少条件测试上下文。分析时维护父节点链，对齐 Babel 的 `ConditionalExpression` 与 Binary/Call/Logical/Member/Unary 规则，并在替换阶段跳过命中的字面量。
- 默认消除括号节点；用户显式设置 `babelParserOptions.createParenthesizedExpressions` 时同步到 Oxc `preserveParens`，并纳入缓存键。不能在一个解析模式下得到事实，再用于另一个模式。
- Oxc 将 directive 表示为普通 Literal，Babel 使用 DirectiveLiteral；按 `ExpressionStatement.directive` 精确排除，保留带括号与非 prologue 普通字符串的原有处理。
- Oxc 的 JSX 属性字符串未按 Babel 方式解码 HTML 实体。含 `&` 的 JSXAttribute 整源回退 Babel，不在快速路径重复实现实体解析器。
- 集中 `parseOxcSync`，优先启用 `experimentalRawTransfer`；能力检查缺失、返回 false 或抛错时使用普通解析，raw 路径抛错后重试普通解析，两者均不可用则由调用链回退 Babel。模块图、source map、ignore 和精确 `classNameSet` 边界维持原有行为。

验证过程中还修正了两种假阳性：Vite 的 options factory 会覆盖传入的 fast-path 选项，必须断言最终选项并观察 Babel 调用；对同模块导出的 spy 不能截获词法内部调用，解析器加载器需独立模块以便真正模拟能力与异常。JSX handler 回归必须传入 filename，避免因误用 JS 解析模式而提前回退。

## 验证

2026-10-04，macOS arm64 / Apple M4 Max，Node 24.18.0，pnpm 12.6.0，Oxc 0.152.0，oxc-walker 1.1.1。在独立 worktree 安装锁文件依赖并构建，不复用其他 checkout 的 node_modules 链接。

从仓库根目录运行（正常测试均禁止更新快照）：

```sh
pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss-demo/web-vue-vite-tailwindcss-v4 install --frozen-lockfile --ignore-scripts
pnpm --filter 'weapp-tailwindcss^...' run build
pnpm --filter weapp-tailwindcss build
CI=1 pnpm --filter weapp-tailwindcss exec vitest run --update=none test/js test/wxml test/bundlers/vite-js-processing.unit.test.ts test/bundlers/vite-runtime-affecting-signature.unit.test.ts test/bundlers/vite-source-candidates-hmr.unit.test.ts test/bundlers/vite-hmr-candidate-state.unit.test.ts test/ci/architecture-contract.test.ts
CI=1 pnpm --filter @weapp-tailwindcss/engine exec vitest run --update=none test/extraction.split-candidate-tokens.test.ts test/extraction.candidate-extractor.test.ts test/v4.candidates.test.ts test/v4.source-scan.test.ts test/v4.generation-session.test.ts test/v4.generation-scan-race.test.ts
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-raw-transfer.ts --output .tmp/oxc-raw-transfer/benchmark.json --pairs 20 --rounds 3
```

Windows PowerShell 可先设置 `$env:CI='1'`，再运行对应 pnpm 测试命令。

- 主包及依赖构建、类型声明生成通过。
- 核心定向 51 文件，556 项通过、4 项既有跳过；Engine 定向 6 文件，83 项通过。
- 条件矩阵包含 4 种字面量、24 种内层/外层表达式组合、2 种括号 AST 模式，共 4,608 次真实 Oxc/Babel 输出对拍。矩阵不额外添加统一外层括号，避免屏蔽显式括号模式下的父链。最后加强矩阵与 JSX 调用断言后，该文件 63 项复验通过。
- parser 用例覆盖 raw 能力检查、异常回退及实际解析器的 AST/模块/注释/诊断对拍；Vite production wrapper 确认比较字符串保留、结果类名转义，并确认 Oxc 未调用 Babel。

### 完整 JS 分析采样

输入由 727 条完整记录构成，125,082 UTF-8 字节、120,720 UTF-16 code units、5,818 个字面量。输入 SHA-256：`21ad19ea581c664217f72ee2acebc73921de585c680e420c3de594deea09bcf3`。源码不能截断到固定字节数后冒充完整负载。

每轮创建两个独立 Node worker，按 normal/raw 交替先后顺序串行采样；每阶段预热 5 对，正式 20 对，重复 3 轮。每对比较全部分析事实和最终代码，240 对全部一致。首次分析计时区严格发生 1 次解析，缓存命中计时区严格为 0 次。每对保存输入、事实和输出哈希，前后核对被测源码与 HEAD 未变化。

| 阶段                  | 普通 AST p50 | raw transfer p50 |     比率 |
| --------------------- | -----------: | ---------------: | -------: |
| 分析缓存未命中        |    11.090 ms |         3.449 ms | 3.216 倍 |
| 分析缓存命中          |    0.0455 ms |        0.0428 ms | 1.064 倍 |
| JS handler 缓存未命中 |    11.803 ms |         4.488 ms | 2.630 倍 |
| JS handler 缓存命中   |     1.295 ms |         1.266 ms | 1.022 倍 |

p50 使用 nearest-rank 统计；三轮分析缓存未命中的比率分别为 3.293、3.090、3.226，均优于普通 AST。缓存命中差异很小，不据此宣称稳定优化。这里的 cold 指预热进程里的分析缓存未命中，不是进程冷启动。

采样时 HEAD 为 `d974423089b62aac0f0005c0cbe569b9a0500c7b`，包含本次尚未提交的修复；因此用实际源码哈希锁定被测实现：`src/js/fast-path/analysis.ts` 为 `df43581a21ffcf112864b0e2591915fe5851dbca4f01929ae266ae82f625314c`，`src/js/oxc-parser.ts` 为 `cdf8da2bed22dee03f9c23cbaeac55a246304c2f04066b82d00eabba2065b568`。完整逐样本数据保存在忽略的 `.tmp/oxc-raw-transfer/benchmark.json`，可用上述持久脚本重新生成。

### 真实 Vite demo

使用 `demo/web/vue-vite-tailwindcss-v4` 的真实 Vite 8.3.0 配置与本 worktree 构建产物。每个模式为独立 Node 进程，生产构建 `write:false`，在同一开发服务与 headless Chromium 页面依次执行文本、新增类、删除和恢复；每次同时校验 DOM、计算样式与页面 session。normal/raw 的完整构建产物哈希及各 HMR 阶段结果均一致。App.vue 逐字恢复，所有临时服务、浏览器与缓存完成清理，未修改 demo/static 基线。

```sh
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/self-check.json --self-check
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/report.json --pairs 3
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/report-weapp.json --target weapp --pairs 3
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/repeat-weapp.json --target weapp --pairs 3
```

Web 目标三对采样通过，但实际 core Oxc 调用数为 0，不能用它归因 raw transfer 收益。其构建中位数 normal/raw 为 1.060/1.007 秒，文本 HMR 为 69.8/65.0 ms，新增类 HMR 为 66.3/66.3 ms；这些只作为该路径的回归记录。

`weapp` 目标确实调用 Oxc：每个进程在 production build 中 2 次、开发启动中 3 次、文本/新增类/恢复各 1 次，删除阶段复用缓存。每组三对共 48 次调用，失败数为 0。首次正式三对及一次预先限定的三对复测全部通过；没有继续反复采样以追求更好的数字。

| 小程序输出目标     |                  首轮普通/raw |              有限复测普通/raw |
| ------------------ | ----------------------------: | ----------------------------: |
| 冷构建中位数       |              1.339 / 1.464 秒 |              2.001 / 1.969 秒 |
| 文本 HMR 中位数    |               128.0 / 86.3 ms |              231.5 / 173.6 ms |
| 新增类 HMR 中位数  |              146.6 / 168.3 ms |              174.3 / 189.7 ms |
| 删除 HMR 中位数    |              145.9 / 168.4 ms |              135.6 / 148.5 ms |
| Node 峰值 RSS 范围 | 626.6–628.2 / 575.3–622.4 MiB | 621.5–635.6 / 617.9–629.8 MiB |

冷构建包含 Vite 加载与 API 构建，不包含进程启动，也未清理操作系统文件缓存。HMR 的 20ms 观察轮询会影响小差异。内存是单个 worker 的 `process.resourceUsage().maxRSS`，不含 Chromium/其他子进程。源码/依赖输入哈希为 `50727f4cfdf2fc8cacb2db23841d25260eefad0847fef1b28ef5ff65907081a5`，小程序目标完整产物哈希为 `560fddf7402079a67bcde204d9d2c468a23fc01c1393241923390ad8b28d346d`。

这些数据没有证明稳定的整体构建加速。首次 raw 冷构建中位数高于普通路径，复测方向反转；复测还保留了普通模式 7.072 秒的首次样本，原因没有定位，不归因为已证实的环境噪声。新增类与删除 HMR 在两组采样中的 raw 中位数均偏高，因此不能把微基准 3.216 倍写成项目构建/HMR 的收益。所有首轮、复测与基础设施验证数据保留在 `.tmp/oxc-vite/`。

首次基础设施验证失败记录为 `.tmp/oxc-vite/verify.json`：`vite.build()` 保留 `NODE_ENV=production`，同进程随后创建的 dev server 因此关闭 Vue HMR，文本保存变成整页刷新。按实际 CLI 阶段分别设置 production/development 并断言开发配置后，`.tmp/oxc-vite/verify-development.json` 与后续正式测量通过。该失败属于测量脚本生命周期，不作为产品回归，也没有通过允许 reload 或增加超时绕过。

## 适用边界

- 本轮验证 Oxc 与现有 Babel 行为一致。Babel 对模板字符串或 TS 包装内的某些比较值也会转义，例如 ``value === `w-[1px]` `` 或 `value === ("w-[1px]" as string)`。本次没有修改这项既有 Babel 行为，因此不能表述为“所有条件比较都安全”。
- 未实施全项目 Rust 化、lazy visitor 或完整 Lightning CSS 替换；CSS 继续走既有 PostCSS 管线，未合入独立 Rust tokenizer/escape 实验。
- 本地覆盖 macOS arm64，尚未取得 Windows/Linux 实机性能结果。能力探测与失败回退有定向测试，不能替代其他平台的性能证据。
- 本次执行定向回归，不宣称全仓或多端验收；未执行全端环境预检及全面测试。

## 规则评估

不新增 AGENTS 规则。现有“先证明语义、固定环境与输入、交替采样、以真实构建/HMR 复核”的工程流程足够，本次把发现的验证盲点落实为可执行测试与基准脚本。
