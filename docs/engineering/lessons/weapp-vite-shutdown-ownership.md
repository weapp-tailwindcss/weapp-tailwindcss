---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 90939a2319e422dd71c89e0c71bde0b02c102c29
regressions:
  - scripts/ci/demo-matrix/weapp-vite-shutdown.test.mjs
  - e2e/dev-startup-readiness.test.ts
  - e2e/dev-startup-matrix.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-environment.unit.test.ts
---

# 开发服务退出时等待资产监听租约恢复

## 症状

weapp-vite 7.4.0 的开发启动与连续 HMR 验收通过后，仍留下 `project.private.config.json` 的 `watchOptions.ignore` 和 `.weapp-vite/ide-asset-watch.json`。在等待真实“开发服务已就绪”后，单独关闭本任务的服务也能复现。该配置只控制项目文件监听，不包含账号票据；这是资源释放问题，与另行修复的[微信登录失效](wechat-login-preservation.md)区分。

## 根因与纠正

启动 smoke 将分包构建的成功行或八秒后的 Tailwind 初始化日志当作整个服务就绪。它可能在框架注册退出信号前结束。现在 weapp-vite 的 smoke 与 demo matrix 共享真实就绪边界：必须先完成“小程序初次构建”，再出现“开发服务已就绪”。

收紧后首次 smoke 在 180 秒超时。普通 dev 和独立 wrapper 都能就绪；首次偏离是 Vitest 注入的 `TEST=true` 被子进程继承。既有环境隔离清除了 `VITEST*` 和 `NODE_ENV/BABEL_ENV=test`，漏掉 `TEST`；consola 因它降为 warn，隐藏了框架全部 info/success/ready 日志，直接 stdout 的 timing 与 Babel 警告仍可见。修复子构建环境边界后，使用真实 consola 子进程证明就绪日志恢复，再通过同一 smoke；没有提高日志级别绕过或延长超时。

即便等到真正就绪，CLI 仍在第一次 SIGINT/SIGTERM 后立即移除监听；测试进程树发出的重复信号可能打断异步清理。兼容补丁在 backend 启动前领取信号，在 finally 的异步清理完成或失败后释放，只移除自身监听。真实 serve action 回归覆盖启动中收到信号、连续重复信号、启动失败和关闭失败。

另一个独立边界在 Vite 8.3.1：它的 SIGTERM 回调先等待 `server.close()`，然后自行 `process.exit()`；框架租约恢复原本在更外层。bundledDev 的环境关闭又不执行普通 pluginContainer 的 `closeBundle`，因此原 ownership 插件没有提供可靠的恢复边界。

补丁同时使用服务器的 `closeServer` hook 和 public `server.close()` 包装。前者覆盖启动窗口，内部 `restart` 保留租约；后者在 finally 等待恢复并缓存同一个关闭 Promise，覆盖“已开始 restart，再收到退出”的竞争。Vite 会复用首次 `_closeServer` 的 Promise，所以仅判断 hook 的 reason 不能解决该交错。租约释放自身也共享 Promise；下一轮安装必须等待旧恢复成功，再重置释放状态，恢复失败则不覆盖旧租约。

## 验证

- 修复前：启动判断六项中四项失败；退出与租约的六项回归全部失败。真实受控退出记录 `leaseRemaining: true`，日志保留重复 SIGTERM 的前后监听数量，没有通过新增 signal listener 改变默认退出行为。
- `CI=1 pnpm install --frozen-lockfile --offline`：直接使用锁文件，零下载。锁文件仅五处补丁哈希替换，独立文本比较确认无其他依赖图变化。
- `CI=1 pnpm test:demo:matrix weapp-vite-shutdown.test.mjs`：十项通过，执行发行包真实 scope、serve action、租约安装/释放及 ownership 插件。覆盖重启交错、并发释放和关闭拒绝。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/dev-startup-readiness.test.ts --update=none`：六项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-environment.unit.test.ts --update=none`：修复前两项失败，修复后四项通过，包括真实子进程日志。
- `CI=1 E2E_DEV_STARTUP_CASE=weapp-vite-tailwindcss-v4 pnpm e2e:dev:smoke --update=none`：两项通过，日志明确包含初次构建与服务就绪，退出后配置恢复、租约删除。
- `CI=1 pnpm test:demo:matrix weapp-vite-shutdown.test.mjs weapp-vite-engine-compat.test.mjs weapp-vite-runtime-contract.test.mjs`：三文件、二十项通过，与上面的关闭测试重叠，不相加计数。
- `CI=1 pnpm e2e:demo:matrix weapp-vite-tailwindcss-v4:weapp`：production、initial、replace、add、restore 全部通过，同一服务连续更新后自动恢复配置、删除租约，static 基线无差异。
- 真实受控启动/退出：在就绪后关闭所属进程组，重复 SIGTERM 下配置逐字节恢复、租约自动删除，记录 `leaseRemaining: false`。原始失败和修复日志分别保留在本任务的 `.tmp/framework-cleanup-signals.log` 与 `.tmp/framework-cleanup-fixed.log`。

## 适用边界

本轮实际运行环境是 macOS，验收对象为本 worktree 的开发服务；没有将这些结果写成 Windows/Linux、IDE 页面或多端业务验收。SIGKILL、断电和系统强制终止不能执行 JavaScript 异步清理，不属于正常退出保证；异常恢复仍须核对租约归属，不能无条件覆盖用户配置。

补丁固定 weapp-vite 7.4.0 与 Vite 8.3.1。上游正式版本除包含[开发引擎兼容修复](https://github.com/weapp-vite/weapp-vite/commit/44136980377f30d4eb354ae90b3e64f33eebde8f)外，还须同时具备信号作用域、服务器关闭等待恢复、并发释放与重新安装边界；通过真实退出和连续 HMR 回归后，才能删除本地补丁。补丁不随公开包发布，无需公开包 change intent。

## 规则评估

不新增 AGENTS 规则，使用持久回归约束生命周期。Git 补丁的上下文行以空格作为格式前缀，后接上游 tab 缩进是有效语法；仅为 `patches/*.patch` 设置对应 whitespace 属性，保留其他文件和补丁的行尾空白检查。
