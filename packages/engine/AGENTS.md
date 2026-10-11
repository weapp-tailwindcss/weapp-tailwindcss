# Engine 规则

## 适用范围

适用于 `packages/engine` 的源码、测试和发布配置。

## 核心职责

提供独立的 Tailwind CSS 4 候选提取、源码扫描、design system 和生成会话。

## 变更原则

- 仅允许生成必需的 CSS 解析、`@source` 处理、选择器别名转换和产物 AST；平台兼容转换归 `packages/postcss`。
- 不依赖 `@weapp-tailwindcss/postcss`、主包、旧 engine 或 Tailwind 官方生成插件，保持依赖图单向。
- 不恢复 v3 引擎、补丁机制、多版本分发或 HTML parser 兼容导出。
- Node/Oxide 保持动态加载；ESM、CJS 和类型声明必须同时可用。
- 路径身份、glob 和来源匹配通过 source-scan 复用；本包拥有文件枚举、候选提取、编译会话和依赖失效。
- 文件系统路径使用 `node:path`；仅 glob、CSS import、报告等逻辑路径边界转换为 `/`。

## 测试要求

迁移和行为调整覆盖候选有效性、来源排除、增量会话、缓存隔离、跨平台路径及发布包导入。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/engine build`
- `pnpm --filter @weapp-tailwindcss/engine test --update=none`
- `pnpm --filter @weapp-tailwindcss/engine typecheck`
- `pnpm --filter @weapp-tailwindcss/engine lint`

## 提交前检查

核对公开导出、中文 change intent、上游 MIT 版权和迁移来源；确认产物不包含 v3 或旧 engine 依赖。
