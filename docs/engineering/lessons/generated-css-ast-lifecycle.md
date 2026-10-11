---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1282
baseline: e976c47772afcdaea3cbe674c84b5146f7d6edc7
regressions:
  - packages/postcss/test/generated-css-ast-lifecycle.test.ts
  - packages/postcss/test/generated-framework-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-universal.integration.test.ts
---

# 生成 CSS 的 AST 生命周期与峰值内存证据

## 症状

PR #1282 的 `30e17cc` 在同一 `e976c477` 基线、原 3 次构建 / 3 次 HMR、5% 门槛下，Taro Vite 连续两轮出现构建峰值 RSS 违例。首次为 1676.11→1793.84 MB，唯一一次有限复测为 1715.05→1809.08 MB。第二轮的构建、插件与 CSS 耗时已经通过，不能把首次耗时增加当作两轮共有热点，也不能继续重跑直到偶然通过。

## 根因与纠正

旧 PostCSS 管线在 `await process(...)` 后已有 `Result.root` 和 `Result.css`，再由字符串裁剪入口解析第二棵 AST。选择器准备修复额外调用 `result.root.toString()`，在旧结果仍可达时再分配一份完整 CSS。第二次解析是既有往返；新增的是选择器变换后的整树序列化。局部 selector parser/cache 不跨轮保存 Root，没有观察到新增长期 AST 泄漏。

阶段分配约 11 MB、选择器 CPU 约 1 毫秒，只能描述阶段观察；它们不能线性排除 V8 扩容、自然 GC 时机和进程树 RSS 的约 94 MB 峰值变化。远端旧 raw 又只保存每次构建的峰值/稳态数组，丢失逐次构建的进程树样本，无法还原峰值来自哪个进程或时间窗。必须保留这个缺证，不能用本地 CLI 树代替远端证据。

## 负责模块与修复

`normalize-generated.ts` 把选择器准备和原位裁剪放在 PostCSS 管线末尾的 `OnceExit`：所有 nesting visitor 完成后处理同一 Root，最后由 PostCSS 首次序列化结果。内部 Root 裁剪函数不解析或序列化；公开字符串裁剪入口继续独立解析并输出字符串，兼容原有调用。

这消除了新增的整树序列化，也消除了既有字符串往返导致的第二棵完整 AST。不跳过大文件、通配选择器或必要兼容步骤，不修改生成样式、性能样本数、计时与 RSS 门槛。

## 验证

- 新资源生命周期回归使用真实 PostCSS nesting、通配 group、字面星号、浏览器规则及 1000 条业务 class。旧实现 1 项失败 / 1 项通过，修复后 5 文件、104 项通过；公开字符串入口仍只解析一次。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/generated-css-ast-lifecycle.test.ts test/generated-framework-selectors.test.ts test/mini-program-generated-css.test.ts test/mini-program-css.test.ts test/content-init-boundary.test.ts --update=none`。
- `pnpm --filter weapp-tailwindcss... run build` 的 21 包依赖闭包构建、修改模块严格 ESLint 通过。真实 Vite 两平台 / full / incremental 及生成器回归 3 文件、80 项通过。
- 9 个受影响 demo 的 static 禁止更新验收 34 项通过，涵盖 Gulp、Mpx、Taro Vite/Webpack React/Vue、Uni、Uni 分包和 weapp-vite。对应基线限定重生成并再次禁止更新验收，输出必须继续相同，不把快照更新用于掩盖样式差异。
- 保存自真实 Taro 构建的四个 normalization 输入，在各独立 Node 22/macOS 进程中按原 options 并发调用一次；不是新增完整构建、HMR 或 guard 样本。候选 4/4 输出 SHA 与 `30e17cc` 相同；最大观察 heap 49,308,992→42,435,568 B，RSS 134,053,888→127,631,360 B；GC 后 heap 18,050,816→17,938,448 B。只有 4 次 `OnceExit` Root 裁剪，没有旧额外整树序列化或第二次 parse 阶段。
- HeapProfiler 单批采样分配估计为 78.901→52.928 MiB。旧 `prune→parse` 子树约 17.994 MiB，`normalize→Root.toString` 和 `prune→Root.toString` 约 3.702 / 3.678 MiB，三个路径在候选中消失；必需的首次 parse 约 17.317→17.306 MiB，最后 LazyResult 序列化继续执行。采样估计具有随机性，约 26 MiB 的差异只能作为本批调用树证据。

## 适用边界

组件输入、源码、依赖清单及输出均冻结校验。单批 macOS 诊断证实重复分配被消除与输出等价，不能证明 Ubuntu 上约 94 MB 的 guard 增幅已消失。最终仍须按新准确 head 验收原配置 Benchmark，保留两轮旧失败和新的逐次构建内存证据；若再次失败，继续定位实际峰值来源。

本轮只执行定向测试、受影响构建与有界组件诊断，没有启动本地全仓/全端验收，没有操作微信 IDE 或浏览器登录态。

## 规则评估

不新增 AGENTS 规则。现有 AST 归属、生命周期、性能证据与根因回归要求已经覆盖该边界；将整树重解析与提前序列化的约束固化为可执行资源回归，避免再以阶段 CPU 耗时替代峰值内存证明。
