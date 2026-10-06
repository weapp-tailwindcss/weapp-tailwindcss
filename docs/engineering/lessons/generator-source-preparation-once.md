---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: bbb5c597300c0d9da6a2c42cedd5cf0f3b07b730
regressions:
  - packages/weapp-tailwindcss/test/tailwindcss/v4-source-preparation.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-source-preparation-macro.test.ts
---

# 增量缓存与原生生成共享同一请求的来源准备

## 症状

真实 watch 仍有多个阶段超过目标耗时，不能把全部问题归因于会话初始化。只读审查确认增量入口先宏展开、再平台兼容，随后原生生成重复同样的准备。默认显式传入 `bareArbitraryValues: false` 也会进入这一路径；缓存初建、候选删除重建和完整产物校验同样重复。

22 项真实生成回归在修复前为 18 失败、4 通过。完整 CSS、raw CSS、classSet、依赖、root 和扫描来源等价断言先通过，随后次数断言稳定得到 2 而不是 1；缓存命中和非增量路径作为对照。

## 根因与纠正

重复工作来自两个编排层分别拥有来源准备。内部描述符仅保存当前请求的宏展开与兼容结果，增量缓存、完整重建和原生产物校验共享它。普通生成自行准备一次。描述符不跨请求缓存，原始/宏来源作为扫描输入的既有区别、样式选项解析位置、目标平台、依赖指纹和局部排序会话身份保持不变。

没有改动 `bareArbitraryValues !== undefined`、显式来源、空扫描数组或 compiled 模式的分支判定，也没有顺带改动候选收集。准备仍在原生生成的错误处理之前，只有既有非 compiled `CssSyntaxError` 会进入 legacy fallback。幂等性检查另发现并修复了[混合外层条件缺陷](css-macro-variant-idempotency.md)，不以宏总是幂等作为未经验证的假设。

## 验证

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4-source-preparation.test.ts --update=none`：22 项全绿。覆盖 Web/小程序、bare 未定义/关闭/开启/指定单位、多份内存来源、空扫描数组、扫描开启、compiled、初建/命中/追加/删除/清空，以及同引擎来源与配置变化。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4-source-preparation.test.ts test/tailwindcss/v4-source-preparation-macro.test.ts test/tailwindcss/v4-engine.test.ts test/tailwindcss/v4-generator.test.ts test/tailwindcss/v4-incremental-artifact.test.ts test/tailwindcss/v4-incremental-config-mutation.test.ts test/tailwindcss/v4-incremental-compat-context.test.ts test/tailwindcss/v4-scan-source-boundaries.test.ts test/tailwindcss/native-generation-session.test.ts test/tailwindcss/generator-order-parity.test.ts test/uni-app-x/local-cascade-session.test.ts test/uni-app-x/local-cascade-source.test.ts test/compiler/tailwind-generation-invalidation.integration.test.ts test/ci/generation-ownership.test.ts test/ci/architecture-contract.test.ts test/css-macro --update=none`：整合宏幂等性修复后，18 文件、205 项通过。
- 主包构建、`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`、修改文件的显式 `eslint --no-ignore` 和 `pnpm architecture:check` 通过。构建保留已有 mixed exports 提示。
- `pnpm agents:check` 与 `git diff --check` 通过；`pnpm release status` 识别主包及 PostCSS 中文 patch intent，没有写版本或发布。

局部微基准使用公开 generator、128 条局部规则、weapp/uni-app-x、`incrementalCache: true`、`scanSources: false`、`bareArbitraryValues: false`，候选按 3 → 5 → 1 新增和删除。每版独立进程预热 2 轮、正式采样 5 轮，每轮新会话带不同 revision 注释，来源解析不计时。基线使用主任务现成构建，其中 bundle 计划优化不影响被测生成器。包含预热的 21 份 CSS SHA-256 全部相同。

| 正式样本 | 基线初始/新增/删除/整轮（ms） | 当前初始/新增/删除/整轮（ms） |
| --- | --- | --- |
| 1 | 19.534 / 15.528 / 16.055 / 51.117 | 25.978 / 15.643 / 16.430 / 58.051 |
| 2 | 22.869 / 11.979 / 28.642 / 63.490 | 21.890 / 11.649 / 16.415 / 49.954 |
| 3 | 25.404 / 13.174 / 15.194 / 53.772 | 19.314 / 12.562 / 14.554 / 46.430 |
| 4 | 17.664 / 18.703 / 14.886 / 51.253 | 16.604 / 12.393 / 13.912 / 42.909 |
| 5 | 21.790 / 11.947 / 13.088 / 46.825 | 19.237 / 10.394 / 12.485 / 42.116 |
| 中位数 | 21.790 / 13.174 / 15.194 / 51.253 | 19.314 / 12.393 / 14.554 / 46.430 |

脚本及完整哈希保存在本任务忽略目录 `.tmp/request-source-preparation-bench.mjs`、`.tmp/request-source-preparation-bench.json`，运行入口为 `node .tmp/request-source-preparation-bench.mjs <基线checkout> <当前checkout>`。

## 适用边界

次数回归确定证明减少重复工作；微基准是小样本，其他 worktree 的单测和构建活动可能带来噪声，不能证明整个 watch 已低于 500 ms。本次没有操作 IDE、设备或浏览器；static 基线和真实 watch 仍由主任务整合后验收，不能将这些定向回归记作全面通过。

## 规则评估

不新增 AGENTS。已有来源身份、缓存生命周期、CSS 所有权和真实性能验收规则足够；本次不削减 CSS key、不绕过生成、不按配置猜测可省略的语义阶段。
