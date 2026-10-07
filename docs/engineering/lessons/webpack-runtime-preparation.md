---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1270
baseline: bcab4a9edd0d7316d18fe4169bf7e57519ff1373
regressions:
  - packages/weapp-tailwindcss/test/bundlers/webpack.loader-preparation.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack.v5-loader-preparation.test.ts
---

# Webpack loader 运行时准备复用

## 症状

Taro Webpack 的完整冷构建在主分支对比中出现约 5% 的本地退化，CI 曾出现 14% 退化。CPU profile 没有显示 Rust handler 是主要差异；源码枚举探针显示一次构建中运行时签名路径会多次触发 Tailwind v4 来源展开。

## 根因与纠正

Webpack loader 通过同一个回调准备运行时类集合。旧实现用布尔值表示“已准备”，并在第一次异步准备刚开始时设置该值。并发 loader 因此会提前继续，或者各自重复执行签名和来源准备；准备失败还可能留下错误的已准备状态。编译开始和 CSS 来源注册又要求清除这份状态，旧请求不能覆盖新的编译轮次。

新增带 revision 的准备协调器：同一轮共享一个 Promise；失效后等待在途任务结束，再以新 revision 准备；旧任务的结果会被丢弃并让调用方等待最新结果；失败会传播给同轮等待者且允许下一次重试。该层只协调生命周期，不缓存跨编译轮次的文件枚举。

## 验证

在 macOS arm64、Node 22.23.3、pnpm 12.9.1 下，Webpack 定向回归 186 项通过，新增准备协调器和真实 loader 回归 10 项通过，主包构建、lint、`git diff --check` 通过。Taro demo 使用 main 与修复版 dist 快照交替冷构建三次：main 中位数 9384.1 ms，修复版 9141.3 ms，减少 2.59%；插件阶段 1264.0/1239.0 ms。两侧 302 项输入指纹一致，产物差异只包含 Webpack 每次进程生成的 runtime key 注释；将该 key 归一化后 5 个 CSS 产物全部一致。

原始报告保存在 `.tmp/webpack-loader-preparation-performance/matrix-raw.json`，语义归一化记录在 `.tmp/webpack-loader-preparation-performance/semantic-artifact-comparison.json`。该采样使用 `WEAPP_TW_NATIVE=off`，因此不能与 Rust 开关收益相加，也不能代表所有 Webpack 项目。Taro 远端旧 run 的失败仍需由当前 head 的 CI 重新验证。

## 适用边界

准备 Promise 只在一个 Webpack plugin 实例和一个编译生命周期内复用。源码、配置、CSS 来源或依赖变化必须经现有 invalidation 入口触发；新增入口不能绕过 revision。Webpack 注释中的随机 runtime key 不属于 CSS 语义，产物比较应先按报告规则归一化。

## 规则评估

不新增 AGENTS 规则。现有编译生命周期和构建图边界已经足够，回归用例固定了并发、失败、失效及旧结果隔离条件。
