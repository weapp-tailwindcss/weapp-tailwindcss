# PostCSS Rust 内核规则

## 适用范围

适用于本目录的 Rust 内核、构建入口与原生接口。

## 核心职责

承接 PostCSS 平台转换中独立的选择器计算。PostCSS AST、插件调用顺序和平台策略仍由上层管线拥有。

## 变更原则

- NAPI 边界使用 UTF-16，保持 JavaScript 非 BMP 字符与孤立代理项的行为。
- 优先批量处理，不能为每个字符回调 JavaScript。
- 保持默认映射、自定义映射和开头数字的既有语义；不可用时由 TypeScript 适配器回退。
- 禁止自行扫描源码或写入 bundler 输出目录。

## 测试要求

Rust 单测覆盖字符和映射边界；Vitest 必须比较原生实现与现有 escape 实现，并验证真实 PostCSS 插件输出。

## 推荐验证命令

- `cargo test --manifest-path packages/postcss/native/Cargo.toml`
- `pnpm --filter @weapp-tailwindcss/postcss build:native`
- `pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/native-selectors.test.ts --update=none --coverage.enabled=false`

## 提交前检查

不提交编译产物；报告原生分支和回退分支的验证命令，不把选择器计算迁移表述为整个 CSS 管线迁移。
