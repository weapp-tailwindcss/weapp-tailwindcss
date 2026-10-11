# 生成编排规则

<!-- agents:cwd=root -->

## 适用范围
本目录的来源准备、生成管线与结果组装。

## 核心职责
协调入口来源、候选范围、核心编译会话、revision 和 CSS 转换。构建器传入来源描述和变化事件，接收结果后提交产物。

## 变更原则
不得引用 bundlers 或构建器类型，包括类型引用和聚合导出。纯 CSS 操作消费 PostCSS 子路径；文件系统入口发现只能使用明确来源。

## 测试要求
覆盖候选隔离、增量删除、过期 revision、会话释放与平台 CSS 输出；迁移后保持旧路径重导出兼容。

## 推荐验证命令
- `pnpm architecture:check`
- `pnpm --filter weapp-tailwindcss exec vitest run test/ci/generation-ownership.test.ts test/bundlers/generator-css.unit.test.ts`

## 提交前检查
旧 bundlers/shared/generator-css 路径只能重导出；新增编排必须放在核心。
