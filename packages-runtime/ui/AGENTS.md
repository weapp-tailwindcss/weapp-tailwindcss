# Package Guidelines (`packages-runtime/ui`)

## 适用范围
- 本文件适用于 `packages-runtime/ui`。
- 该包是跨端 UI 运行时层，核心目标是统一 API 并兼容 Native/Taro/uni-app。

## 架构约束
- 目录职责遵循 `ARCHITECTURE.md`：
  - `src/adapters/`：平台差异抽象（事件名、组件映射、能力检测）。
  - `src/hooks/`：跨组件复用逻辑（交互状态、输入类行为等）。
  - `src/components/`：组件实现，按 `core`、`layout`、`feedback`、`navigation`、`data-display` 分层。
  - `src/utils/`：纯函数工具与 class 组合能力。
- 新组件优先采用“逻辑与渲染分离”：先提取 hook，再实现平台渲染层。

## 开发原则
- 不要在组件内部硬编码平台事件名，统一走 adapter 映射。
- 组件对外 API 应保持跨平台一致，平台差异留在 adapter/render 层消化。
- 涉及样式能力分支时，优先用 `supportsCssFeature`/`supportsApiFeature` 显式判断。
- 新增组件时，先补类型定义，再补实现与测试，避免“先实现后补类型”导致导出漂移。

## 推荐验证命令
- `pnpm --filter @weapp-tailwindcss/ui build`
- `pnpm --filter @weapp-tailwindcss/ui test`
- `pnpm --filter @weapp-tailwindcss/ui tsd`
- 若改动适配层：`pnpm --filter @weapp-tailwindcss/ui exec vitest run test/adapters/adapter.test.ts`

## 提交前检查
- 确认导出入口（`components/hooks/utils/adapters`）未被意外破坏。
- 对新增或变更组件补至少一条行为测试（事件映射、状态切换或 class 产物）。
