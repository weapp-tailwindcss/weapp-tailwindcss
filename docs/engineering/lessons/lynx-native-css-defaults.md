---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 94888daf3fda4e3d70a6df11e9d8a2504aa768b2
regressions:
  - packages/postcss/test/lynx-css-compat.test.ts
  - e2e/lynx-css-defaults.test.ts
  - e2e/lynx-rspeedy.test.ts
---

# Lynx 默认变量不能随浏览器选择器一起丢弃

## 症状

全面回归日志中的 `CSS selector parse failed, ignore` 包含两类问题。space/divide、peer-checked 和 theme-midnight 是兼容性实验室已登记的 encoder unsupported 项；`*,::before,::after,::backdrop` 与 `:root,:host` 则携带普通 utility 仍需消费的默认值，不能统一当作浏览器 preflight 噪声。

只读解码原有 promo bundle 后，`.border` 仍引用 `--tw-border-style`，整个 bundle 却没有该变量的定义。实验室现有 border 用例额外带有 `border-solid`，不能覆盖缺少显式边框样式的路径。最小主题与 utility 生成输入还复现了默认 transition 变量留在即将被删除的 root 规则中。

## 根因与纠正

Web 兼容层把 Tailwind `@property` 初值转为四个通配/伪元素选择器共用的声明。生产编码器拒绝 `::backdrop` 后会删除整组，因此 `*` 上的边框、阴影和 ring 默认值也一并消失。Lynx 兼容层现在仅识别完整的默认选择器集合与纯 `--tw-*` 声明，保留编码器接受的 `*`、before、after；不改写业务复杂选择器，也不把运行时 `--tw-*` 变量固定成字面量。没有 theme 变量时也必须执行这一处理。

主题静态化补齐明确的 `--default-transition-*` 和 `--default-mono-font-*` 命名空间。只有顶层纯 root/host 中可完整解析的稳定值进入静态化；局部、条件、混合选择器、优先级、冲突值、CSS-wide 关键词、循环和动态别名均保留。这样既修复默认值丢失，也避免扩大错误固定动态主题的范围。

原生回归沿实际示例的 React plugin → template plugin 解析生产 TASM 0.0.49，并使用独立 TASM 0.0.53 WASM decoder 检查产物。最初在同一进程加载两个版本的原生库时触发 SIGSEGV，改用独立 WASM decoder 后通过；不能把该异常当产品 CSS 回归，也不能通过增加 worker 或跳过编码规避。解码器仅展示变量占位符，不展示 fallback 映射；transition 回归同时检查真实 encoder 输入的 `defaultValueMap`、解码后的变量绑定与属性保留，不据此声称已验收设备上的动画时长。

## 验证

- 首轮 AST 回归为 3 失败、4 通过；改为 WASM decoder 后、修复源码前的真实编码回归为 3 失败、1 通过。原始工具结果摘录保存在本任务忽略目录 `.tmp/lynx-first-regression-results.txt`，包含 session/chunk 标识，并明确不是补跑日志。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/lynx-css-compat.test.ts --update=none`：19 项通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`：122 文件、1243 项通过，保留原有 3 项跳过；最终日志 `.tmp/lynx-postcss-final.log`。
- `CI=1 pnpm e2e:lynx:static:update`：重新生成 `examples/react-lynx/src/compatibility/static-evidence.json` 与实验室 bundle。catalog hash、全部 generated/bundled 结果和 unsupported 原因均不变，基线仅刷新生成时间。
- `CI=1 pnpm e2e:lynx --update=none`：同一次 Vitest 调用的 4 文件、18 项通过，包含真实 Rspeedy bundle、生产编码回归、声明证据与报告契约；默认单 worker、原有隔离设置下没有原生库冲突。日志 `.tmp/lynx-combined-verification.log`。
- `CI=1 DEBUG=lynx pnpm --filter @weapp-tailwindcss/example-react-lynx-promo exec rspeedy build --mode development`：串行构建通过，无 selector/property 删除警告。对实际 `main.lynx.bundle` 解码，确认 `*, ::before, ::after { --tw-border-style: solid; }` 与仍引用该变量的 `.border` 同时存在。日志 `.tmp/lynx-promo-build-serial.log`、`.tmp/lynx-promo-decoded.log`。
- promo 一度与联合回归的依赖重建并行，依赖的 `dist` 清理窗口导致 `source-scan/dist/index.js` 报 `ERR_MODULE_NOT_FOUND`。首次失败保存在 `.tmp/lynx-promo-build.log`；依赖构建结束后串行复验通过。这是任务编排错误，不修改产品代码补偿，也不把该样本覆盖掉。共享依赖产物的构建不能视为独立任务并行。
- 修改的 TypeScript 文件通过 ESLint；`pnpm release status` 识别三包中文 patch intent；`pnpm agents:check`、`git diff --check` 通过。

## 适用边界

本次验证针对 Tailwind 4.3.3、React plugin 0.20.2、template plugin 0.16.1 与 bundle engineVersion 3.9 的生成/编码链路。动态 theme 与浏览器伪类的原生支持仍由 Lynx 决定，保留源码不代表该语义已经得到支持。

本任务没有启动浏览器或设备，没有刷新历史 iOS/Android 报告；默认值恢复后的设备视觉与动画行为仍待主流程验收，因此记录保持 `partial`。

## 规则评估

不新增 AGENTS 规则。以实际生产 encoder 和解码产物回归补足缺口，保留已登记 unsupported 契约，并把设备结论与编译证据分开记录。
