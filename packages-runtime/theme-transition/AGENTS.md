# Package Guidelines (`packages-runtime/theme-transition`)

## 适用范围

- 本文件适用于 `packages-runtime/theme-transition`。
- 该包同时提供运行时主题切换逻辑与 Tailwind 插件导出，需兼顾浏览器能力差异与 Tailwind 版本兼容。

## 核心职责

- `src/index.ts`：`useToggleTheme`，处理 View Transition API、坐标解析、动画降级与错误兜底。
- `src/tailwindcss.ts`：Tailwind 插件，基于 `darkMode` 配置生成 view-transition 相关 base 规则。
- `src/utils/*`：环境探测、几何计算与 Promise 统一调用。

## 变更原则

- 运行时必须保持“可降级”：任一步骤失败都应回退到普通 toggle，不阻断主题切换。
- `darkMode` 解析需兼容 `media/class/selector/variant`，并对非法 variant selector 维持告警行为。
- 修改动画几何计算时，需保证不同视口/坐标输入下 clip-path 合法且可预测。
- 插件导出面（默认导出与命名导出）保持一致，避免破坏 CSS `@plugin` 与 JS 引入方式。

## 测试要求

- 修改 `useToggleTheme` 时，至少覆盖：
  - 无 View Transition 环境降级；
  - 支持 View Transition 的完整路径；
  - 异常抛出时的回退行为。
- 修改 `tailwindcss` 插件时，至少覆盖：
  - 各 `darkMode` 策略；
  - 非法 selector 告警分支；
  - Tailwind CSS 4 的插件调用路径。

## 推荐验证命令

- `pnpm --filter theme-transition test`
- `pnpm --filter theme-transition tsd`
- 定向回归：
  - `pnpm --filter theme-transition exec vitest run test/index.test.ts`
  - `pnpm --filter theme-transition exec vitest run test/tailwindcss.test.ts`
