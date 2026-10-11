# Package Guidelines (`packages/shared`)

## 适用范围

- 本文件适用于 `packages/shared`。
- 该包是跨包公共底座，任何行为变化都可能影响多个上游包。

## 目录与导出约束

- `src/index.ts`：通用工具导出（字符串、数组、正则、对象合并等）。
- `src/node.ts`：Node 环境相关工具（例如 `md5`、路径扩展名处理）。
- `src/extractors/`：选择器切分与校验工具。
- 对外导出应保持稳定，新增导出需评估命名冲突与语义边界。

## 变更原则

- 优先保持函数纯度与无副作用，避免在基础工具层引入 I/O 或全局状态。
- 修改公共工具默认行为时，必须先评估依赖方影响（尤其是 `regExpTest`、`defuOverrideArray`、`splitCode`）。
- 与路径相关逻辑必须兼顾跨平台（Windows 路径分隔符与 POSIX 兼容）。
- 提供新工具时，优先小而明确，避免“万能函数”导致语义模糊。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/shared test`
- `pnpm --filter @weapp-tailwindcss/shared exec vitest run test/index.test.ts`
- `pnpm --filter @weapp-tailwindcss/shared exec vitest run test/extractors.test.ts`

## 提交前检查

- 修改导出面时，确认 `exports` 与类型声明产物保持一致。
- 基础函数语义调整必须补回归测试，不仅更新快照。
