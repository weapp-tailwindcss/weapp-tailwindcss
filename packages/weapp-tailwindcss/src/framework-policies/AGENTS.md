# 框架策略规则

<!-- agents:cwd=root -->

## 适用范围
`packages/weapp-tailwindcss/src/framework-policies/**`。

## 核心职责
在兼容入口把框架配置、环境事实和样式目标转换为编译核心的中立能力快照。

## 变更原则
- `resolve.ts` 是唯一策略组合入口，具体框架文件互不引用。
- 不得依赖 bundler、模块图、插件生命周期或执行 CSS AST 转换。
- 中立契约位于 `compiler/framework-policy.ts`，不得反向引用框架实现。
- 不缓存环境解析结果；每个请求持有独立快照。

## 测试要求
覆盖显式配置优先级、环境切换、框架默认值、原生和 Web 输出以及实例隔离。

## 推荐验证命令
- `pnpm --filter weapp-tailwindcss exec vitest run test/framework-policies.test.ts test/runtime-branch.test.ts test/options.test.ts`
- `pnpm architecture:check`

## 提交前检查
确认生成管线只消费策略字段，现有导出和配置默认值保持兼容。
