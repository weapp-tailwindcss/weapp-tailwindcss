---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 48b0f965f779b69abb9985b97a721c557dc01afb
regressions:
  - packages/postcss/test/uni-app-x-runtime-variables.test.ts
  - packages/postcss/test/css-custom-property.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/runtime-variables.test.ts
---

# uni-app x 局部样式必须保留运行时变量

## 症状

预检轮次 `efbec914-eb36-474e-9c79-52d6f22bfb56` 的微信 watch 在原有 `text-xs` 基线断言停止。主样式保留 `font-size:var(--text-xs)` 与 `line-height:var(--tw-leading,var(--text-xs--line-height))`，页面 alias 却输出 `24rpx` 与固定 `calc(1 / 0.75)`。失败快照位于该轮 `wechat-followup/text-xs-first-failure`，不修改历史失败结果。

字体大小存在独立的证据证明范围限制，但动态行高不能仅通过扩大签名白名单解决。固定 fallback 不再响应同节点的 `--tw-leading`，空自定义属性也不等于变量缺失。必须保留完整双声明、变量赋值和条件结构。

## 根因与纠正

uni-app x preset 对小程序、WebView 也配置了 `custom-properties: { preserve: false }`。作者 fallback 已有保护，但其变量分类将所有 `--tw-*` 视为主题变量，运行时状态因此进入固定值转换。原生 UVUE 的 `theme.ts` 另有明确的静态降级契约，不能用该契约证明支持 CSS 变量的小程序结果等价。

本次在平台 pipeline 中仅为 uni-app x 非 UVUE 目标启用保护，包装真实 `postcss-custom-properties` 插件的声明转换。每次处理从当前 AST 建立变量反向依赖图：直接引用 `--tw-*` 的声明，以及经主题别名、局部或条件声明间接引用这些变量的声明，都保留运行时表达式。闭环依赖有访问集合，状态不跨 Root 或处理请求缓存。固定主题值仍可内联，其他插件继续转换原声明，避免以整段占位屏蔽单位、颜色等处理。

不修改通用主题变量分类、签名断言、声明数量或原生 UVUE 行为。仅对明确 `appType: uni-app-x` 的框架链路启用保护，独立 `uniAppX: true` 标志仍保留历史处理。保留内层主题变量引用，不凭缺少消费者信息推断其 fallback 是否生效。

变量身份复用共享 CSS 名称解析。value-parser 会拆开十六进制转义的终止空白，因此共享依赖提取在转义输入中补充 token 解析，作者 fallback 分类也读取逗号前完整参数。完整 Map 回归证明不会多出截断变量，仍保留原有非标准参数的保守依赖检测。

## 验证

- 实现前 PostCSS 新回归 9 项失败，原生 UVUE 对照通过；主包真实 preset → 局部样式保留 → 二次转换的微信/WebView 两项均失败，实际输出已冻结行高。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/uni-app-x-runtime-variables.test.ts test/uni-app-x.test.ts test/color-mix-compat.test.ts test/pipeline.test.ts test/handler.cache.test.ts test/handler.root.test.ts test/calc-escaped-identifiers.test.ts test/calc-auto.test.ts test/calc-context.test.ts test/calc-explicit-alias-context.test.ts --update=none`：10 文件、208 项通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/css-custom-property.test.ts --update=none`：1 文件、9 项完整 Map 断言通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x/runtime-variables.test.ts test/presets/uni-app-x.test.ts test/uni-app-x/border-preflight.test.ts test/watch-hmr-class-variables.unit.test.ts test/watch-hmr-class-declaration-proofs.unit.test.ts --update=none`：5 文件、163 项通过。
- `pnpm --filter @weapp-tailwindcss/postcss build`、`pnpm --filter weapp-tailwindcss build` 通过；定向 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess 类型检查、8 个 TypeScript 文件的 ESLint（关闭 Prettier 规则）通过。
- `pnpm architecture:check`、`pnpm agents:check`、`git diff --check` 通过；`pnpm release status` 确认两包中文 patch intent 已纳入发布计划。完整集成验证与对应 static 基线由主任务在整合后执行。

主任务在 `f6163e0a9` 整合字号证明、宏幂等性和两项重复工作优化后，PostCSS 13 文件 248 项、主包 44 文件 762 项均通过；两包构建、根 `pnpm typecheck`、架构与规则检查通过。使用 Alpha 5.31 限定 `uni-app-vite-vue3-hbuilderx-tailwindcss-v4`、`uni-app-x-vdom-tailwindcss-v4`、`issue-1144-static` 三个 static 入口重生成 24 份快照，再以 `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 --update=none` 复验 3 文件 4 项通过。Git 差异仅 VDOM 的 `app.wxss` 与 `main.wxss` 各新增 5 行，恢复 `.transform` 的动态 rotate/skew 链和 `.drop-shadow-md` 的动态 filter 链；其他基线内容不变。

原始日志为 `.tmp/runtime-preservation-{postcss-build,main-build,main-tests,typecheck,static-update,static-verify}.log`。static 更新用时 40.01 秒，禁止更新复验用时 152.41 秒；后者执行期间机器 load average 只读样本为 98.54/92.43/79.14。该环境观察不改变通过结果，也不作为后续性能失败的免责或调宽阈值依据。

## 适用边界

本次未运行真实 watch、微信 IDE、浏览器或设备，不证明 500 ms 性能预算或全面矩阵已通过。保留动态表达式也不证明页面上的最终计算值；真实运行仍需当前轮次环境门禁和消费者证据。

主包回归调用真实 preset 与 PostCSS，仅覆盖编译产物契约。此次会改变部分小程序局部 CSS 输出，主任务必须重新生成并审查受影响 uni-app x static 基线，再禁用更新复验，不能用定向回归替代。

## 规则评估

不新增 AGENTS。既有平台兼容归属、动态变量边界和完整证据规则已经足够，通过生产路径回归落实。
