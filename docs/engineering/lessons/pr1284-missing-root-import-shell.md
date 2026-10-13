---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1284
baseline: 832ce283228ab8dd2f6c9ee9a7c06a4fc2ac61e8
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-root-shell-emission.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-helpers.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-style-memory.test.ts
---

# Vite 连续重建遗漏根样式导入壳

## 症状

[Version PR CI 38404214918](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38404214918) 的 macOS 微信 watch job 在全部修改与回滚完成后，未通过最终产物快照门禁。dev 快照的根样式为 23 字节的 `@import "./main.wxss";`，HMR 快照将其标记为 removed；目标样式仍有 31478 字节。错误信息中的“replaced local import shell”不能据此解释为壳被生成 CSS 覆盖，实际是资产缺席。

## 根因与纠正

框架的增量产物图可能省略根样式壳。CSS finalizer 已持有框架导入关系，但恢复函数仅改写本轮已有资产；目标 CSS 的缓存回放也不能代替壳的发射。

恢复函数继续消费生命周期登记的导入关系，缺席时提交资产写入计划，finalizer 通过 Rollup `emitFile` 发射。已存在的壳保留原合法导入，目标 CSS 仍承接组件样式注入。无发射器时不报告恢复成功。真实删除由框架样式记忆层清理关系，不能要求目标一定出现在本轮 partial bundle，也不能在收尾阶段读取源码猜测归属。

## 验证

使用上述 main 基线加本轮修复，在独立工作树执行 Node 26.10.0 与 pnpm 12.9.1 的定向验证。新增测试使用真实 Rollup 4.63.5、虚拟入口及实际 finalizer，不模拟资产发射：三种非微信后缀的初次输出成功，旧实现均在第二轮缺壳时失败；修复后连续三轮、同轮重复 finalizer、组件样式注入和移除登记关系均通过。

```sh
CI=1 pnpm --filter 'weapp-tailwindcss^...' run build
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-root-shell-emission.test.ts test/bundlers/vite-helpers.unit.test.ts test/bundlers/vite-css-finalizer.unit.test.ts test/bundlers/vite-import-shell-rebuild.test.ts test/bundlers/vite-framework-style-memory.test.ts test/bundlers/vite-watch-css-output.test.ts test/bundlers/vite-remembered-css-replay-root-shell.unit.test.ts test/bundlers/vite-remembered-css-replay-cache.unit.test.ts --update=none
CI=1 pnpm --filter weapp-tailwindcss build
CI=1 pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
CI=1 E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' pnpm exec vitest run --bail=1 -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4.test.ts -u
CI=1 E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' pnpm exec vitest run --bail=1 -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4.test.ts --update=none
CI=1 E2E_WATCH_CASE='uni-app-vite-tailwindcss-v4:mp-weixin' E2E_WATCH_SAVE_SNAPSHOTS=1 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=9000 pnpm exec vitest run -c e2e/vitest.e2e.watch.config.ts e2e/watch/hot-update/demo/uni-app-vite-tailwindcss-v4.test.ts --update=none
```

包回归为 8 文件 94 项通过，构建和类型检查通过。对应 uni-app Vite v4 项目的 static 基线重新生成，13 份快照内容均未变化；本轮修复只恢复增量构建缺席资产，不改变完整构建 CSS 语义。源码 ESLint 通过；测试文件按仓库配置被忽略，未作为 lint 通过证据。

本地真实微信 watch 完整通过，耗时 395.63 秒，覆盖主包模板、脚本、样式、图标、内容和普通/独立分包的修改与回滚，最终 dev/HMR 产物快照门禁通过。报告为忽略的 `e2e/benchmark/e2e-watch-hmr/2026-10-13T14-48-09-454Z-uni-app-vite-tailwindcss-v4-mp-weixin.json`。这项验证未连接或操作微信 IDE。

## 适用边界

修复使用产物图与已登记关系，适用于框架小程序根样式壳的增量恢复，不改变 Web 生成或多导入壳语义。仍需修复落 main 后重新生成的 #1284 head 的完整 CI/CD。另一个 Lynx iOS 启动失败发生于 runner 极高系统负载与低可用内存，独立采用有界重跑核验，不通过增加超时掩盖环境问题。本轮未运行本地全仓、多端 IDE 或设备验收。

## 规则评估

现有规则已经要求通过 bundler API 发射资产、使用生命周期归属、准确 head 验收。新增真实 Rollup 回归守住边界，不新增或放宽 AGENTS 规则。
