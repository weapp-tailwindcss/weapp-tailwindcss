# Compiler Guidelines (`src/compiler`)

## 适用范围

- 本文件适用于 `packages/weapp-tailwindcss/src/compiler/**`。

## 核心职责

- 维护与 bundler 无关的 source graph、candidate index、编译 revision、结构化 CSS artifact 与平台 adapter 契约。
- bundler 只能向本层提交显式源码、依赖、scope 和变更，不得让本层猜测项目目录或输出文件名。

## 变更原则

- AST 必须有明确所有者；缓存或跨 adapter 使用时必须 clone。
- `classSet` 必须来自生成器验证结果，禁止启发式补充。
- 不得导入 Vite、Webpack、Rollup、Vinyl 等 bundler 类型。
- 不得直接写文件或扫描构建输出目录。

## 测试要求

- 修改 graph、candidate、invalidation、composition 或 adapter 时必须补独立单测。
- HMR 相关行为必须覆盖 candidate 添加、删除、文件删除和 revision 隔离。

## 推荐验证命令

- `pnpm --filter weapp-tailwindcss exec vitest run test/compiler`

## 提交前检查

- 确认 compiler 模块不依赖 `src/bundlers/**`。
- 确认返回给调用方的 Root 与内部缓存不共享可变节点。
