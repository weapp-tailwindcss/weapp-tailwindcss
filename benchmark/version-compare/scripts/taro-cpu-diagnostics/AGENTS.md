# Taro CPU 诊断规则

## 适用范围
- 本目录与其创建的独立诊断证据；不是正式性能门禁。

## 核心职责
- 以真实 Taro Node runner 每侧执行一次，采集整个主进程 CPU 与已完成加载的 CJS 磁盘身份。

## 变更原则
- 只接受无根 `.git`、已冻结安装并构建的两个 prepared root，不隐式安装或修改生产源码。
- 保持 `diagnosticOnly: true`、`budgetAcceptance: false`；不修改正式预算、统计确认或关闭顺序，不主动 GC。
- 未对齐业务窗口或缺失源码映射的归因必须为 `unknown`；退出哈希开销属于整个 CPU profile。
- 固定上限失败不能静默截断后声明完整；清理仅限该次派生的进程组或精确 PID 树，并保留首败。

## 测试要求
- 使用复制的真实 `scripts/taro-build-runner.mjs` 与真实 Node `--cpu-prof` fixture；覆盖身份、业务失败、超时和上限。

## 推荐验证命令
- `pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs benchmark/version-compare/test/taro-cpu-diagnostics.test.mjs --update=none --maxWorkers=1`
- `pnpm agents:check`

## 提交前检查
- 确认诊断没有进入普通 PR 默认路径，不声称框架性能通过或 processAssets 热点已定位。
