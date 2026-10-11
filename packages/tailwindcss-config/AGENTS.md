# Package Guidelines (`packages/tailwindcss-config`)

## 适用范围

- 本文件适用于 `packages/tailwindcss-config`。
- 该包是 Tailwind 配置加载基础设施，多个上游包会依赖其解析结果。

## 核心职责

- `src/index.ts`：基于 `lilconfig` + `jiti` 搜索/加载多种配置格式（js/cjs/mjs/ts/cts/mts）。
- `src/utils.ts`：公共配置合并工具导出。

## 变更原则

- 保持加载行为可预期：
  - `config` 显式路径优先于 `cwd` 搜索；
  - `cwd` 搜索路径集合顺序稳定。
- 新增或调整 `searchPlaces` 时，必须评估向后兼容影响。
- 加载器（`jiti`）行为变更时，需验证 TS 与 ESM/CJS 的互操作。
- 避免在该包中引入与“配置加载”无关的业务逻辑。

## 测试要求

- 修改 `loadConfig` 时，至少覆盖：
  - `cwd` 自动搜索；
  - `config` 显式路径；
  - 不同配置格式（cjs/js/ts/mjs）。
- 快照变更需确认是预期行为变化，而不是加载顺序或路径解析回归。

## 推荐验证命令

- `pnpm --filter tailwindcss-config test`
- `pnpm --filter tailwindcss-config build`
- 定向回归：
  - `pnpm --filter tailwindcss-config exec vitest run test/index.test.ts`
  - `pnpm --filter tailwindcss-config exec vitest run test/utils.test.ts`
