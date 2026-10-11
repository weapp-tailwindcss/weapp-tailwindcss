# Package Guidelines (`packages/debug-uni-app-x`)

## 适用范围

- 本文件适用于 `packages/debug-uni-app-x`。
- 该包提供 Vite 调试插件，核心价值是把 transform 与 bundle 产物落盘到 `.debug` 目录便于排查。

## 核心职责

- `src/index.ts`：`debugX()` 插件工厂，生成 `pre/normal/post` 三阶段调试插件。
- 负责模块 ID 规范化、非法文件名字符清洗、asset/chunk 分目录输出。

## 变更原则

- 路径清洗逻辑需保持安全与可读（去 query/hash、替换虚拟模块前缀、过滤非法字符）。
- 输出目录结构（`.debug/<stage>/...` 与 `bundle-<stage>/...`）属于调试契约，修改需谨慎。
- 调试功能不应影响正常构建语义：即使写文件失败处理也应避免干扰主构建流程（如需增强请显式说明）。

## 测试要求

- 修改核心逻辑时，至少覆盖：
  - transform 输出路径；
  - bundle keys 索引写入；
  - asset/chunk 分支写入。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/debug-uni-app-x test`
- `pnpm --filter @weapp-tailwindcss/debug-uni-app-x build`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/debug-uni-app-x exec vitest run test/index.test.ts`
