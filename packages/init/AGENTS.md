# Package Guidelines (`packages/init`)

## 适用范围

- 本文件适用于 `packages/init`。
- 该包负责初始化脚手架文件与依赖版本写入，属于“直接修改用户项目文件”的高影响模块。

## 核心职责

- `src/index.ts`：初始化主流程（读取上下文、更新 `package.json`、生成 PostCSS/Tailwind 配置）。
- `src/npm.ts`：拉取 npm registry 版本并生成默认 devDependencies 版本映射。

## 变更原则

- 修改写文件逻辑时，保持“幂等 + 最小变更”：
  - 不应重复注入相同脚本或依赖；
  - 不应覆盖用户未涉及字段。
- 生成模板需同时兼容 `package.json` 的 `type=module` 与 CommonJS。
- 默认 registry 行为变更需谨慎，必须保证可通过 `fetchOptions` 显式覆写。
- 涉及依赖版本策略调整时，说明文档需同步更新，避免脚手架与文档不一致。

## 测试要求

- 修改初始化流程时，至少覆盖：
  - 有 `package.json` 场景；
  - ESM 场景；
  - 缺失 `package.json` 场景（应安全跳过）。
- 修改版本拉取逻辑时，需覆盖 `defaultDevDeps` 版本区间预期。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/init test`
- `pnpm --filter @weapp-tailwindcss/init build`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/init exec vitest run test/init.test.ts`
  - `pnpm --filter @weapp-tailwindcss/init exec vitest run test/npm.test.ts`
