# Package Guidelines (`packages/reset`)

## 适用范围

- 本文件适用于 `packages/reset`。
- 该包是静态 reset 样式资源包，主要面向 `uni-app` / `taro` 入口样式直接导入。

## 核心职责

- 提供可直接发布的 CSS reset 资源，不承担运行时逻辑、构建器集成或 AST 转译职责。
- 对外行为以导入路径稳定为先，避免频繁改动目录结构或文件名。

## 变更原则

- 优先保持静态资源可读性与跨端兼容，不为“更短”牺牲条件编译语义。
- 若修改现有 reset 规则，必须说明来源依据或兼容性原因，避免无来源漂移。
- 新增 reset 资源时，优先保持 `uni-app` 与 `taro` 两套目录结构对齐。

## 测试要求

- 至少补充静态资源存在性与关键规则断言测试。
- 若调整导出路径或 `package.json` 字段，需覆盖对应回归测试。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/reset test`
- `pnpm --filter @weapp-tailwindcss/reset exec vitest run test/index.test.ts`

## 提交前检查

- 确认 `package.json` 的 `exports` 与实际文件结构一致。
- 确认 README 中的导入示例能对应到真实存在的文件。
