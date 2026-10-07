---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1270
baseline: 27336282d64077cfdb57b864bb512a53a685e526
regressions:
  - packages/weapp-tailwindcss/test/js/oxc-parser.test.ts
  - packages/weapp-tailwindcss/test/js/precheck.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-semantic-parity.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-js-processing.unit.test.ts
---

# Oxc 首次传输成本与 Rust 整体收益复验

## 症状

PR 的默认关闭 Rust 路径在 uni-app 与 mpx 性能门禁中分别回退 5.74% 和 8.03%。此前 125 KB 微基准证明了预热后的 raw transfer 收益，却不能解释全新构建进程的首次解析。

## 根因与纠正

Oxc 0.152.0 首次 raw 调用同步加载 eager 入口和对应 AST 形态的大型反序列化器。真实 uni-app 的 107,509 code-unit vendor 在六次独立进程交替构建中，raw 首次解析需 40.7–49.7 ms，普通 AST 为 13.5–15.1 ms。`tasks.js` 还包含异步任务等待，不能把其累加值完全归因于解析 CPU 时间。

产品现在先使用 512 Ki code units 的冷阈值；同一 JS/TS AST 形态及 range 模式成功使用 raw 后，降至已验证的 96 Ki 阈值。状态按 parser 对象弱引用保存，普通 AST 与失败的 raw 调用不会标记初始化完成，显式普通 AST 的 runtime snapshot 继续按原策略执行。这里只选择两种等价 AST 传输方式，不跳过必要语义分析。

另外，关闭快速路径或启用 module graph 时，预筛此前仍扫描全部引号片段，却不消费扫描结果。将扫描限定到真正使用精确成员判断的分支，保留其余分支的依赖与提示规则。新增回归确认这些分支不访问扫描所需的 escapeMap，已有模块图及输出矩阵验证其行为。

微基准新增 `--process-cold`，每对重新创建两个独立 worker，首次计时前不解析；计时包含反序列化器初始化，排除 Node 启动和 parser 模块 import。normal/raw 仍独立强制对应传输，不能将这个实验误读为产品自动选择策略。

## 验证

2026-10-07，macOS arm64 / Apple M4 Max，pnpm 12.9.1。基于上述提交及本轮改动，先构建 core dist，再串行运行各性能实验；不并行执行测试与采样。Oxc 源码 SHA-256 为 `43c201a9358a4bc5e465251aedad7425ddee145838b7b258797fde5bffb7bc18`。

125,082 字节输入 SHA-256 仍为 `21ad19ea581c664217f72ee2acebc73921de585c680e420c3de594deea09bcf3`：

| 环境与阶段 | 普通 AST 中位数 | raw 中位数 | 结论 |
| --- | ---: | ---: | --- |
| Node 22.22.3，全新 worker 的首次分析，三轮共九对 | 15.016 ms | 23.572 ms | raw 首次分析更慢 |
| Node 24.18.0，预热后的分析缓存未命中，三轮共六十对 | 10.979 ms | 4.182 ms | raw 快 2.625 倍 |
| Node 24.18.0，预热后的 handler 缓存未命中 | 11.888 ms | 5.169 ms | raw 快 2.300 倍 |
| Node 24.18.0，handler 缓存命中 | 1.024 ms | 1.037 ms | 无收益 |

不同 Node 的样本不合并。预热实验三轮分析比率为 2.702、2.600、2.604；全部 240 对事实和最终代码一致。首次分析实验九对也逐项一致。报告分别为 `.tmp/oxc-raw-transfer/process-cold-v22.json` 和 `cold-policy-warm-report.json`。

真实 vendor 扩展样本覆盖约 107、215、430、860、1,720 K code units，JS/TS 各三对独立进程。860 K JS 的首次普通/raw 中位数为 121.3/63.4 ms，TS 为 159.8/72.7 ms；支持对大型源码承担首次成本的策略，不声称阈值能保证所有语法密度都更快。

Node 22.22.3、原生关闭时，以保存的旧 dist 和新 dist 交替运行各三个真实构建；源码、Node、依赖及配置相同，模式顺序为旧/新、新/旧、旧/新：

| 项目与阶段 | 修复前 | 修复后 |
| --- | ---: | ---: |
| uni-app `tasks.js` | 296.5 ms | 164.6 ms |
| uni-app 插件总计 | 1129 ms | 1086 ms |
| mpx `tasks.js` | 147.1 ms | 123.6 ms |
| mpx `processAssets` 总计 | 738 ms | 688 ms |

每个项目的六次完整产物哈希一致。uni-app 为 `3ea05a7fc10d410c04aad5def40984fff9b48fad316d8b2e26b4ce41fa4c57f0`，mpx 为 `cae4122f4f73f3c1e1d4546f45ebfdc3f482e2ea02b8284f01737e06ad3f4488`。报告位于 `.tmp/compare-dist/report-v22.22.3.json`。

### 同一新基线的 Rust 开关对比

默认路径也变快后，不能继续用较慢的旧 off 路径计算 Rust 收益。重新在 Node 22.22.3 上串行运行真实 uni-app CLI，按 off/auto、auto/off、off/auto 三对交替测量：

| 阶段 | off | Rust auto | 耗时减少 |
| --- | ---: | ---: | ---: |
| 完整 CLI 构建，包括 pnpm 启动 | 3640.5 ms | 3587.4 ms | 1.46% |
| 插件总计 | 1057 ms | 997 ms | 5.68% |
| `generateBundle` | 685 ms | 631 ms | 7.88% |
| `tasks.js` | 161.7 ms | 36.2 ms | 77.62% |

所有输出与上述 uni-app 哈希相同。auto 共观察到 33 次批量候选 ABI 调用，其中三次返回 null 并按原语义回退，异常为零；off 调用数为零。Node 峰值 RSS 范围为 off 484320–508272 KiB、auto 492720–496576 KiB，未证明稳定内存优势。原始报告为 `.tmp/native-build-profile/report-v22.22.3.json`。

因此此前约 6% 的完整构建收益只属于旧基线，新基线中 Rust 的增量收益为约 1.5%。这两个百分比不能累加。

### 真实 Vite 与 HMR

重新执行原有持久 runner 的 native self-check、单对基础设施验证和三对正式实验，Node 24.18.0、目标 weapp。三对正式实验的 off/required 中位数：冷构建 1071.3/1058.4 ms，开发启动 1120.8/1073.5 ms，文本 HMR 68.1/70.6 ms，新增类 173.4/171.3 ms，删除 149.3/150.5 ms，恢复 151.7/152.9 ms。小差异不足以证明稳定的 HMR 加速。

构建产物 SHA-256 为 `560fddf7402079a67bcde204d9d2c468a23fc01c1393241923390ad8b28d346d`，输入指纹为 `6f824ff3b1fbe8b574483677b7e238f83216ea6d5c71194f736331e364f47419`。846 次真实原生调用及全部 DOM、计算样式、页面 session 校验通过，六个 worker 的 `restored=true`、`cleanupErrors=[]`。Node 峰值 RSS 为 off 641872–642816 KiB、required 630064–635680 KiB。App.vue 逐字恢复，未修改 demo/static 基线，临时服务与 headless browser 全部释放。报告为 `.tmp/oxc-vite/cold-policy-native-report.json`。

可复现的定向命令：

```sh
pnpm --filter weapp-tailwindcss build
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-raw-transfer.ts --process-cold --pairs 3 --rounds 3 --output .tmp/oxc-raw-transfer/process-cold.json
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-raw-transfer.ts --pairs 20 --rounds 3 --output .tmp/oxc-raw-transfer/warm.json
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --compare native --target weapp --output .tmp/oxc-vite/native-self-check.json --self-check
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --compare native --target weapp --output .tmp/oxc-vite/native-verify.json --pairs 1 --timeout-ms 60000
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --compare native --target weapp --output .tmp/oxc-vite/native-report.json --pairs 3 --timeout-ms 60000
pnpm --filter weapp-tailwindcss exec vitest run test/js test/wxml test/native-mode.test.ts test/native-vite-benchmark.test.ts test/bundlers/vite-js-processing.unit.test.ts test/bundlers/vite-runtime-affecting-signature.unit.test.ts test/bundlers/vite-source-candidates-hmr.unit.test.ts test/bundlers/vite-hmr-candidate-state.unit.test.ts test/ci/architecture-contract.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/engine exec vitest run test/extraction.split-candidate-tokens.test.ts test/extraction.candidate-extractor.test.ts test/v4.candidates.test.ts test/v4.source-scan.test.ts test/v4.generation-session.test.ts test/v4.generation-scan-race.test.ts --update=none --coverage.enabled=false
pnpm exec cross-env WEAPP_TW_NATIVE=required pnpm --filter weapp-tailwindcss exec tsx native/test/transform/babel.ts
```

正常测试另设置 `CI=1`。JS/WXML/Vite 定向 61 文件、679 项通过、4 项既有跳过；Engine 六文件、83 项通过；Babel/Rust 对拍 6224 项一致、1024 项明确回退。主包构建、严格 TypeScript 与源文件/测试显式 ESLint 检查通过。

## 适用边界

本轮没有全项目 Rust 化；Rust 继续显式 opt-in，默认关闭。主要剩余构建开销来自 CSS 及框架构建阶段。后续优先测量并减少重复解析、无效扫描与边界传输，保留 PostCSS 完整语义，不由局部内核倍率推导整体收益。

本地性能仅覆盖 macOS arm64，样本每组仅三对；Windows/Linux 性能与全部 PR CI 尚待验证。这里只执行定向回归与普通 headless Web 验证，不宣称全仓或多端设备验收。

## 规则评估

不新增 AGENTS 规则。将已有性能工作流要求落实为可执行的首次分析实验、真实输出比较及初始化状态回归，并保留旧数据和修正原因。
