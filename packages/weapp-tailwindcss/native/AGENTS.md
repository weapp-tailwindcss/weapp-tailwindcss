# Rust 原生编译内核

## 适用范围

- 本规则适用于 `native/**`，补充主包与仓库规则。

## 核心职责

- 在 Rust 中执行独立的解析、扫描和转换内核，通过 Node-API 交付紧凑结果。
- TypeScript 继续拥有公开 API、插件生命周期和用户回调。

## 变更原则

- 字符串位置采用 JavaScript UTF-16 code unit，不得把 UTF-8 byte offset 直接交给 JS。
- 输入保留孤立代理字符；需要转成 UTF-8 的解析器必须显式检查并回退。
- 原生依赖使用精确版本并提交 Cargo.lock。不得在用户安装时隐式下载或编译二进制。
- 新增内核保留可用的 JavaScript 回退与差分测试；加载失败不改变原有功能。

## 测试要求

- Rust 单测覆盖状态转换与异常输入，Node 差分测试覆盖真实 ABI、Unicode 和消费者。
- 跨平台构建使用 `build.mjs`，避免 shell 特有语法。

## 推荐验证命令

- `pnpm --filter weapp-tailwindcss exec node native/build.mjs`
- `pnpm --filter weapp-tailwindcss exec node native/verify.mjs`
- `pnpm --filter weapp-tailwindcss exec vitest run test/wxml/Tokenizer.test.ts test/wxml/native-tokenizer.test.ts --update=none --coverage.enabled=false`

## 提交前检查

- 不提交 `target`、`.node` 或本机绝对路径。
- 记录原生与回退路径验证结果；本机测试不替代其他操作系统的 CI。
