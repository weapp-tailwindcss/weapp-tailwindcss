---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1251
baseline: 3f57cdab2818bb409233a31535b475e0ba9fc333
regressions:
  - packages/postcss/test/handler-gradient-fallback.test.ts
  - packages/postcss/test/post-declaration-dedupe.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-css-composition.test.ts
  - packages/weapp-tailwindcss/test/postcss/style.test.ts
  - e2e/taro-vite-react-tailwindcss-v4.test.ts
  - e2e/taro-vite-vue3-tailwindcss-v4.test.ts
  - e2e/apps-generator-mode-compare.test.ts
---

# Taro 渐变回退与 PostCSS 阶段顺序

## 症状

全仓静态回归出现 Taro Vite React、Vue3 与 generator 对比三项失败。NutUI 的部分标准渐变从 `rgba()` 变为透明十六进制颜色，Vue 产物末尾另少了 `--text-base:1rem`、`--radius-lg:.5rem`。

首个 React generator 失败样本的总大小从 428676 降至 428593 字节，选择器始终为 2256。不能只凭体积变小与选择器不变认定它是合法快照漂移。首次最小回归有 4 项失败，分别覆盖用户前缀、前置变量、前置厂商渐变与 `preserve:true`。

## 根因与纠正

本轮使用 `postcss-preset-env@11.5.5`、`postcss-color-hex-alpha@11.0.1`、`@csstools/utilities@3.0.0`。后两者在旧基线中已经存在，并非本轮依赖升级新引入。

上游 hex-alpha 转换器在 `Declaration` 阶段调用 `hasFallback`；该函数只检查同一父节点前面是否出现同名属性，不检查值、前缀支持或 `important`。Autoprefixer 在 `OnceExit` 阶段生成前缀。用户阶段与平台阶段拆开后，平台转换开始时已存在 `-webkit-gradient(...rgba...)`，后续标准 `linear-gradient(...#0000...)` 被误判为已有完整回退。

用同一配置分别运行旧的组合管线与当前串行管线，能够稳定重现旧、新输出。最初曾判断前置 WebKit 回退足以接受颜色变化；复查 demo 的 production 浏览器查询后推翻该结论：IE 等非 WebKit 目标支持标准渐变，却不能消费该 WebKit 回退或透明十六进制颜色。因此必须修复转换，不能把十六进制漂移写入基线。

修复位于 PostCSS 包：原位包装 preset-env 实际选中的 hex-alpha 子插件，保留其浏览器选择、插件位置、feature、`preserve`、URL 与 `@property` 行为，仅用浅临时父节点隔离相邻声明后调用原转换器。每轮 `prepare` 的弱引用记录阻止重入重复添加回退；自定义属性名按大小写精确匹配。

后处理去重也必须尊重作者的中间覆盖。普通属性遇到另一普通属性即建立保守边界，避免猜测 shorthand/longhand 关系；同属性不同值不能跨越去重。物理属性优先策略继续保留，`important` 分开处理。对应回归覆盖颜色覆写、背景 shorthand、逻辑与物理属性的两种顺序。

Vue 的两项变量属于另一原因：作者 `page` 中已经保留正确的 `32rpx`、`16rpx`，末尾 rem 值是旧的重复恢复。原有 framework composition 契约要求只保留适配后的值；新增 legacy/graph 与大输入用例验证这两个变量各仅出现一次，因此这一差异可以更新基线，无需改生成器。

只读检索上游仓库的 `hex-alpha fallback` 和 `hasFallback`，未发现对应现有 Issue/PR；没有向上游发送消息。本修复处理本仓库阶段组合契约，没有修改依赖或新增颜色解析器。未来升级上游后，应继续用上述回归判断包装是否仍必要。

## 验证

所有普通回归使用 `CI=1` 和 `--update=none`。通过的定向检查：

- `pnpm --filter @weapp-tailwindcss/postcss test --update=none`：124 个文件、1258 项通过；3 项为既有 NutUI 跳过用例。
- `pnpm --filter @weapp-tailwindcss/postcss build`：产物与声明构建通过。
- `pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/framework-css-composition.test.ts --update=none`：4 项通过。
- `pnpm exec eslint packages/postcss/src/pipeline.ts packages/postcss/src/plugins/preset-env.ts packages/postcss/src/plugins/post/decl-dedupe.ts`：通过。
- `pnpm release status`：识别中文 intent，变更范围为 PostCSS 与主包 patch。

静态更新设置 `TARO_BUILD_STRICT=1`、`E2E_PROJECT_FILTER=^taro-vite-(react|vue3)-tailwindcss-v4$`，执行：

```sh
pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts e2e/apps-generator-mode-compare.test.ts -u
```

限定更新的 19 项通过；generator 同时覆盖这两个项目的微信、Web 与 Web compact 构建。最终只修改 9 份快照/报告：React 旧的重复 NutUI 块中 2 处颜色补降级，Vue 6 处颜色补降级并移除末尾 2 项重复变量。React 总大小为 428724，Vue 为 339051，选择器分别维持 2256、1693；Web 两种模式没有基线变化。

随后使用同一项目过滤与同一命令，将 `-u` 换成 `--update=none` 再验证，3 个文件、19 项全部通过。`pnpm --filter @weapp-tailwindcss-demo/taro-vite-react-tailwindcss-v4 build:alipay` 也通过；遍历真实 `.acss` 文件集合解析 NutUI 标准渐变，确认保留 `rgba(...,0.01961)` 而非透明十六进制颜色。`git diff --check` 与 `pnpm agents:check` 均通过。

首次全仓失败、最小回归失败、更新前的真实构建差异与后续验证日志保存在本任务忽略的 `.tmp-taro-*.log`；持久证据为上述测试及精确的产物 diff。

后续 PR head `6d2eb5064` 的单测分片发现主包旧快照遗漏上述保守去重的输出变化：Taro 输入与默认 preflight 都含 `box-sizing:border-box`，两者之间有 `margin`、`padding` 等普通属性。新去重边界保留后一个声明，计算值不变；不能为消除一个重复声明恢复跨任意属性去重。本地 `test/postcss/style.test.ts --update=none` 同样复现 1 项失败、70 项通过。仅以 `-t 'main chunk build error' -u` 更新该用例，审查 diff 为单个 `box-sizing` 声明；随后主包 style、defaults、framework composition 共 83 项，以及 PostCSS 去重 3 项以 `--update=none` 通过，无跳过。本次只补漏掉的单测基线，不改产品源码或 demo 基线。

## 适用边界

只对 preset-env 已启用的 hex-alpha 转换生效，现代浏览器或显式关闭 feature 不会强制降级。包测试和静态构建不代表设备视觉验收；本任务没有启动浏览器、IDE 或模拟器。

## 规则评估

不新增 AGENTS 规则。现有“先核对源码语义，再限定更新基线”和“优化 fast path 必须证明被跳过处理没有语义贡献”已覆盖此类问题，补持久回归即可。
