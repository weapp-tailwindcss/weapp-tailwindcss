---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 81e2ed52c78a397bd4e48e04b41668358d7e4b90
regressions:
  - e2e/framework-ide-watch-lifecycle.test.ts
  - e2e/framework-ide-support.test.ts
---

# IDE 与 watch 的启动顺序

## 症状

完整工作流在微信框架验收中有 11 项通过，weapp-vite 在 `watch ready` 阶段报 `Component is not found in path "wx://not-found"`。此前启动及 reLaunch 的运行时检查正常。

## 根因与纠正

通用 IDE 探针先打开生产产物，再执行 watch 所需的首轮完整构建，随后启动开发 watcher。IDE 已监听产物目录，因而会读到完整构建清理、替换期间的不完整组件图。保留错误收集器的直接连接复现得到同样异常。

调整资源生命周期：首轮构建、watch 启动及就绪在打开 IDE 前完成；同一个 watcher 覆盖全部增量操作。关闭本轮 IDE 项目后恢复源码并回收 watcher。启动失败不进入 IDE 回调，运行时错误继续原样阻断，不清空收集器或新增忽略规则。

## 验证

- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/framework-ide-watch-lifecycle.test.ts e2e/e2e-matrix.test.ts --update=none`：37 项通过。
- `E2E_PROJECT_FILTER=weapp-vite-tailwindcss-v4 pnpm e2e:ide`（指定本轮官方 CLI）：修复后 3 项通过，模板、脚本可见 HMR 和样式产物检查均通过，运行时无组件缺失。
- 证据目录为 `e2e/.artifacts/preflight/b9c98ff6-4c32-4c68-b6d5-22948b91bb5e/`。保留完整失败日志、直接连接复现、CLI 诊断与 `weapp-vite-ide-lifecycle-fix.log`。
- 一次原样定向重试在 launch 阶段超时，官方 CLI 指定项目启动成功；随后通过明确端口连接复现原问题，未将启动超时直接归因为产品错误。

## 适用边界

该修复调整验收编排，没有修改 demo 或生成样式语义，无需更新 static 基线。完整 workflow 必须在新预检下重新验证；定向通过不能替代其余框架及多端运行验收。

## 规则评估

不新增 AGENTS 条目。已有构建图、生命周期与分层验收要求足够，通过资源作用域和启动顺序回归维持边界。
