# Package Guidelines (`packages/weapp-style-injector`)

## 适用范围

- 本文件适用于 `packages/weapp-style-injector`。
- 该包提供样式入口注入实现，并继续暴露原有 Vite/Webpack 与框架预设入口。

## 目录与职责

- `src/core.ts`：通用样式注入核心。
- `src/subpackage.ts`、`src/uni-app.ts`、`src/taro.ts`、`src/mpx.ts`：框架分包解析与入口生成。
- `src/vite.ts`、`src/webpack.ts`：Vite/Webpack 入口实现。
- `src/vite/*`、`src/webpack/*`：框架预设入口。
- `src/index.ts`：根入口导出。

## 变更原则

- 保持现有 `package.json` exports 不变，避免破坏独立包用户导入路径。
- `weapp-tailwindcss` 通过 workspace 依赖复用本包实现；行为修改应在本包完成，并通过两个消费路径测试验证。

## 高风险改动提醒

- 修改 `src/uni-app.ts` 的 `pages.json` 解析或注释剥离逻辑时，需覆盖异常 JSON 场景。
- 修改 `src/taro.ts` 的 `vm` 解析流程时，需验证 TS/JS/JSON 三种 `app.config` 输入。
- 修改 `src/core.ts` 注入逻辑时，需验证 raw `@import` 与路径字符串两类输入。

## 推荐验证命令

- `pnpm --filter weapp-style-injector test`
- `pnpm --filter weapp-style-injector build`
- 定向回归：
  - `pnpm --filter weapp-style-injector exec vitest run test/index.test.ts`

## 提交前检查

- 确认 `src/index.ts` 导出面与 `package.json` `exports` 对齐。
- 若新增预设选项，同步补充类型导出与至少一条 fixture 回归用例。
