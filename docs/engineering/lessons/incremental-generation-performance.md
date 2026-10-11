---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1254
baseline: 8512a516b251f3fa33a6ef744534eaa086fba33a
regressions:
  - packages/weapp-tailwindcss/test/compiler/tailwind-generation-invalidation.test.ts
  - packages/weapp-tailwindcss/test/compiler/tailwind-generation-invalidation.integration.test.ts
  - packages/engine/test/v4.module-cache.test.ts
  - benchmark/performance/demo/test/step-isolation.test.mjs
  - benchmark/performance/demo/test/stylesheet-marker.test.mjs
  - benchmark/performance/demo/test/source-artifact-identity.test.mjs
---

# 生成会话失效与接入成本实测

## 症状

用户反馈安装、构建与热更新变慢。本次针对文本更新和依赖失效调查，不能把 Tailwind 引擎生成速度直接等同于框架保存到页面生效时间。

基准提交的 `TailwindGenerationSessionPool` 收到任意依赖变化后清空所有生成会话。多入口互不依赖时，这会重新准备无关入口的生成状态。另一方面，现有 graph compiler 已维护自己的 root 依赖索引；本次会话池优化针对 legacy/shadow 生成会话：shadow 路径同时登记 graph 依赖并执行 legacy 生成，协调器通知依赖变化时可以保留无关入口。默认 graph 生成使用 `FrameworkCompilerSession`，因此不能声称所有默认 Vite/Webpack HMR 都有相同比例收益。已补图协调器到会话池的连续保存与入口隔离回归。

调查还发现两个正确性问题：共享 CJS 配置在间接依赖刷新后可能生成空样式，删除依赖可能继续返回旧值；生成失败时，丢弃 `.finally()` 返回的 Promise 会额外产生未处理拒绝。这些问题在基准会话池和优化会话池中均可复现，与局部失效策略无关。

## 根因与纠正

生成会话记录 source 声明和实际生成返回的依赖。只有完成生成且没有并发不确定性的实例可以证明其依赖范围；已知路径仅淘汰依赖它的实例。未知路径、缺少路径、仅执行候选校验、生成失败和仍在执行的实例保持保守失效。空变更不失效，迟到结果只更新旧实例自身，不能修改替代实例。依赖 ID 按编译图的原始身份精确匹配，无法确认的路径别名回退全失效。

显式 `.cjs` 模块改用与 `require.cache` 相同的同步加载通道，避免动态 ESM 包装保留旧 exports。其他模块格式仍走既有 Tailwind 加载器；不修改 ESM、CTS 或公开配置 API。失败清理使用带成功／失败处理器的 `.then()`，保持调用方收到原始异常。

周报脚本原来随每个文本 marker 重写 CSS，使“文本更新”包含额外样式构建。现在仅在样式输入改变或外部改写后保存 CSS；静态预编译剥离注释后重新附加本轮观察 marker，并从当前挂载的内联和外链样式验证。CSS marker 不代替实际类名、计算样式和页面结构断言。`styleSavePolicy` 进入趋势身份，禁止与旧口径直接比较。

## 验证

### 会话池独立实验

环境：macOS arm64、Apple M4 Max、Node 24.18.0；正式计时关闭 profiling。2、8、24 个入口分别预热 2 轮、采样 20 轮，两批反向版本顺序。一次操作通知第一个配置依赖变化，再请求全部入口生成；配置内容保持相同，目的是隔离失效本身的重复工作，每个输出完整 CSS 哈希一致。实际内容修改、间接依赖、删除和恢复由真实 Tailwind 集成回归另行验证。

| 会话数 | 批次 | 优化前 median / p95 ms | 优化后 median / p95 ms | median 差值 | 差值 % |
| --- | --- | --- | --- | --- | --- |
| 2 | 1 | 2.83 / 7.71 | 1.67 / 5.76 | -1.16 ms | -41.0% |
| 2 | 2 | 2.85 / 8.12 | 1.47 / 4.09 | -1.37 ms | -48.2% |
| 8 | 1 | 10.63 / 15.55 | 1.74 / 3.21 | -8.89 ms | -83.7% |
| 8 | 2 | 9.44 / 15.62 | 1.69 / 3.33 | -7.75 ms | -82.1% |
| 24 | 1 | 28.21 / 38.63 | 2.91 / 7.14 | -25.30 ms | -89.7% |
| 24 | 2 | 26.48 / 33.48 | 2.69 / 7.67 | -23.79 ms | -89.8% |

每次失效后存活会话从 0 变成 N−1。工作进程峰值 RSS 两批分别为 660.8→425.6 MiB、664.2→427.1 MiB；该指标覆盖全部规模，不能解释成单次操作独占内存。

独立 CPU profile 的叶帧采样中，Tailwind 编译代码累计约 564.6→135.6 ms、GC 约 165.1→47.2 ms。这是定位证据，不参与验收统计，也不是可相加推导真实 demo 加速的计时。两组共用修复后的引擎和其他依赖，仅会话池源码不同。

复现：先构建引擎和主包，运行 `node benchmark/performance/scripts/compare-generation-invalidation.mjs --base-ref 8512a516b251f3fa33a6ef744534eaa086fba33a --out-dir .tmp/generation-invalidation`。输出包含两批原始样本、打包入口哈希、环境、CSS 哈希和独立 profile。

### npm 稳定版三组报告

固定 npm 发布版 5.5.11，目标 `web/vue-vite-tailwindcss-v4:web`，独立锁文件中的 Vite 为 8.3.0、Tailwind 为 4.3.3，不能从 demo 名称推断 Vite 主版本。构建和启动各 7 轮；七种 HMR 各预热 2 轮、采样 20 轮，全部三组语义与完整性通过。

| 指标（median ms） | 不接入 | 静态等价 | 正常接入 | 正常接入减静态 |
| --- | --- | --- | --- | --- |
| 冷构建 | 254.80 | 247.81 | 696.56 | +448.75 ms / +181.1% |
| 热构建 | 253.39 | 250.42 | 690.38 | +439.96 ms / +175.7% |
| 首次页面就绪 | 370.30 | 367.49 | 798.75 | +431.26 ms / +117.4% |
| 文本 HMR | 34.62 | 35.91 | 35.58 | -0.33 ms / -0.9% |
| 新类新增 HMR | 34.71 | 134.29 | 164.63 | +30.34 ms / +22.6% |
| 主题配置 HMR | 34.70 | 135.03 | 164.29 | +29.26 ms / +21.7% |

文本 HMR 没有可确认的额外开销；主要成本在启动和构建，因此没有提交新的文本缓存生产分支。静态组涉及样式变更时串行保存 CSS 与源码，并验证已挂载样式，不能把上述差值当作纯 Tailwind CPU 耗时。观察轮询和页面验证包含在 HMR 数字里。

仓库编排命令为 pnpm 12.6.0，消费项目按其 manifest 使用 pnpm 12.8.1（安装日志已归档）；两种源码版本使用相同工具链。报告的顶层 pnpm 字段描述编排器，不能替代消费项目日志。

本机直连 npm registry 的 TLS 主机名验证失败；未关闭证书校验，实测通过 HTTPS npmmirror 取得同一确切版本和完整性证据。这里只测构建／HMR，不代表 npm 官方网络下载速度。源码优化实验使用单独 tarball 身份，不能混入此表。

### 源码 tarball 的代表 demo 对照

三个目标沿用清单：`web/vue-vite-tailwindcss-v4:web`、`web/react-webpack-tailwindcss-v4:web`、`subpackage-taro-webpack-react-tailwindcss-v4:weapp`。每个版本安装完整内部依赖闭包，外部依赖版本和 integrity 相同；每批构建／启动 7 轮，HMR 预热 2 轮后采样 20 轮。两批的版本顺序互相反转。

本轮完成 120 个版本／批次／指标记录，其中 77 个可比较、43 个未通过完整性或观察断言。下面只展示正常接入组；三组原始样本、RSS、语义哈希、锁文件和失败栈保存在 `final-source/report.json`。N/A 行不计算性能收益。

| 目标 | 批次 | 指标 | 前 median / p95 ms | 后 median / p95 ms | median 差值 | 差值 % |
| --- | --- | --- | --- | --- | --- | --- |
| Vue Vite Web | 1 | 冷构建 | 722.29 / 818.63 | 708.56 / 1156.15 | -13.74 ms | -1.90% |
| Vue Vite Web | 1 | 页面启动 | 796.59 / 832.46 | 784.60 / 857.10 | -11.99 ms | -1.51% |
| Vue Vite Web | 1 | 文本更新 | 36.02 / 163.16 | 35.55 / 144.58 | -0.47 ms | -1.29% |
| Vue Vite Web | 2 | 冷构建 | 715.48 / 1147.12 | 719.72 / 737.17 | +4.24 ms | +0.59% |
| Vue Vite Web | 2 | 页面启动 | 801.31 / 815.75 | 799.64 / 829.03 | -1.67 ms | -0.21% |
| Vue Vite Web | 2 | 文本更新 | 130.53 / 202.37 | 35.46 / 164.92 | -95.07 ms | -72.84% |
| React Webpack Web | 1 | 冷构建 | 1258.89 / 1834.51 | 1207.08 / 1969.32 | -51.81 ms | -4.12% |
| React Webpack Web | 1 | 页面启动 | 1428.92 / 1720.76 | 1425.14 / 1635.77 | -3.79 ms | -0.27% |
| React Webpack Web | 1 | 文本更新 | N/A | N/A | N/A | N/A |
| React Webpack Web | 2 | 冷构建 | 1211.63 / 2170.41 | 1223.20 / 2065.99 | +11.57 ms | +0.95% |
| React Webpack Web | 2 | 页面启动 | 1471.73 / 1574.48 | 1478.04 / 1603.90 | +6.31 ms | +0.43% |
| React Webpack Web | 2 | 文本更新 | N/A | N/A | N/A | N/A |
| Taro Webpack 分包 | 1 | 冷构建 | 6160.70 / 6611.90 | 4945.31 / 6300.64 | -1215.39 ms | -19.73% |
| Taro Webpack 分包 | 1 | 产物启动 | 2575.95 / 3433.68 | 2538.15 / 3355.15 | -37.80 ms | -1.47% |
| Taro Webpack 分包 | 1 | 文本更新 | N/A | N/A | N/A | N/A |
| Taro Webpack 分包 | 2 | 冷构建 | 5032.78 / 6691.66 | 5062.29 / 7502.36 | +29.52 ms | +0.59% |
| Taro Webpack 分包 | 2 | 产物启动 | 3386.44 / 3482.52 | 3691.28 / 6885.15 | +304.84 ms | +9.00% |
| Taro Webpack 分包 | 2 | 文本更新 | N/A | N/A | N/A | N/A |

不能从该表确认普遍的端到端收益：Vite 文本更新第二批的明显改善没有在第一批复现，Taro 冷构建第一批的改善也未复现；分包启动第二批出现 +304.84 ms / +9.00% 的疑似退化。原生和静态启动同批也明显变慢，但这不能直接证明是环境噪声，需保留一次反向确认结果。

失败范围：

- Webpack 三个版本／批次的七类更新未全部完成：静态组挂载 CSS 缺少本轮 marker，以及不接入组恢复时页面 marker 未到达。第二批优化前七类更新完成。该 React demo 没有 Fast Refresh，实际 reload 与 HMR 按样本分别记录。
- Taro 分包三个版本／批次的七类更新未全部完成；保存现场确认源码已有新 marker，输出 JS 仍是旧 marker，另一次静态恢复后作者样式仍为 43rpx（预期 41rpx）。第二批优化前三组七类更新全部完成，但没有完整的优化后配对，不能计算 HMR 改善。
- Vite 第二批优化前热构建中，一个不接入组短构建的 RSS 为 null；保持失败，不填零，也不把近似 250 ms 采样当作短进程的精确峰值。

这些测量使用 `changed-input-only-v1`。后续恢复 CSS 的观察屏障调整属于测量工具修正，不能覆盖或拼接本轮失败样本。源码报告与 npm 5.5.11 周报分开，未冻结或抬高预算。

启动场景按相反版本顺序独立复测一次（`--phases startup --confirmation`），三组各 7 轮，语义、RSS 和样本完整性全部通过。接入组 median 3439.10→3441.32 ms（+2.21 ms / +0.06%），未复现 +9% 的 median 退化；p95 3788.98→4926.60 ms，尾部仍有波动，不能据此宣称全部指标没有退化。不接入组 median 2380.30→2410.99 ms，静态组 2389.30→2440.77 ms。三份原始结果均保留，不继续重复测试到偶然通过。

恢复状态也等待 CSS 挂载后，另以发布版 5.5.11 执行一次 Webpack 诊断（启动 1 轮，HMR 预热 2 轮、计划 20 轮，策略 `changed-input-only-v2`）。启动三组通过，但静态组在预热期仍等待 CSS marker 超时，未取得正式 HMR 样本。失败时已记录实际 DOM、当前挂载 CSS 原文、控制台与 HMR 状态：源码因未注册 accept 而 reload，最终 hot 为 idle，挂载 CSS 仍不含预期新 marker。恢复屏障不是该失联问题的充分修复，不宣称 Webpack 连续更新已恢复；不通过删断言或重构建放行，也不把无插件静态组失败算成本次优化的性能退化。

### 本地定向回归

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/compiler test/bundlers/vite test/bundlers/webpack test/ci/architecture-contract.test.ts --update=none`：138 文件、1,336 测试通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/engine exec vitest run test/v4.module-cache.test.ts test/v4.design-system-refresh.test.ts --update=none`：11 测试通过。
- 最新复验 `CI=1 pnpm test:perf:demo`：30 文件、101 测试通过。
- 新增会话池单测与真实生成集成测试最新复验：2 文件、19 测试通过。
- 引擎与主包已分别构建；主包严格类型检查、引擎类型检查、架构检查、生产文件 lint、`pnpm agents:check` 和 `pnpm release status` 通过。

## 适用边界

原始报告保存在忽略目录 `.tmp/incremental-perf/`，可通过上述脚本重现。没有修改 demo 源码、tracked 产物快照或性能预算。每次 demo 准备都重新生成 static 输入并归档为 `static-inputs.json`，之后计时构建只做验证。

本次为 macOS / Node 24 的定向验证，不代表 107 个目标、Windows/Linux、IDE 或设备全量验收。未启动本地全面测试，不以本轮定向结果替代全端预检。后续优先定位静态组连续保存失联与短进程 RSS 漏采，再分解已观察到的启动／构建额外成本；安装、CSS 解析、入口加载与其他语言配置模块缓存仍是后续调查方向。没有证据的生产修改不纳入本 PR。

## 规则评估

不新增 AGENTS 规则。现有“先固定语义再测量”“生产与诊断边界分离”和保守失效要求足够；用回归测试防止测量脚本制造样式工作、旧异步结果污染及 CJS 刷新遗漏。
