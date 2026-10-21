---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: e6dce0558bbf3dc442162e76ccc26e56f7c55832
regressions:
  - e2e/tailwind-hmr-server.test.ts
  - e2e/tailwind-hmr-browser-errors.test.ts
  - e2e/tailwind-hmr-runner.test.ts
verification:
  - claim: 完整 Chromium 定位隐式图标请求，服务资源缺失回归先失败
    kind: integration
    status: failed
    sha: e6dce0558bbf3dc442162e76ccc26e56f7c55832
    environment: macOS arm64；Chromium 156.0.8078.4、headless；真实独立 Vite 页面记录 favicon.ico 的 console 404 URL；新增资源回归 1 失败、1 通过，生产夹具尚未修复
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-hmr-server.test.ts --update=none
  - claim: 晚到错误和借用 Browser 清理回归先失败
    kind: unit
    status: failed
    sha: e6dce0558bbf3dc442162e76ccc26e56f7c55832
    environment: 同批未提交回归；合成生命周期 3 失败、2 通过；不作为真实浏览器能力证据
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-hmr-runner.test.ts --update=none
  - claim: 修复后六文件三十二项回归及禁止更新的 static 比较通过
    kind: integration
    status: passed
    sha: e6dce0558bbf3dc442162e76ccc26e56f7c55832
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；同批未提交修复；CI=1、--update=none；static 仅 fixtureHash 改变，所有 CSS 字节与哈希不变
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-hmr.test.ts e2e/tailwind-hmr-server.test.ts e2e/tailwind-hmr-browser-errors.test.ts e2e/tailwind-hmr-runner.test.ts e2e/tailwind-browser-lifecycle.test.ts e2e/tailwind-persistence.test.ts --update=none
  - claim: 三引擎真实源码 HMR 定向复验通过
    kind: integration
    status: passed
    sha: e6dce0558bbf3dc442162e76ccc26e56f7c55832
    environment: 同批未提交修复；run daaf5b5e-4828-42c5-89b4-a23ed6740c43；完整 Chromium 156.0.8078.4、Firefox 157.0、WebKit 27.2，headless；逐引擎串行生产 runHmr 各 26 断言通过、0 warnings；finally 关闭自有 context 和 browser；仅定向回归，不代表全端验收
    command: pnpm exec tsx .tmp/hmr-three-engine-regression.mts
---

# HMR 独立页面资源与错误收尾

## 症状

源码 d654 与 e6 的 Web Chromium CI 在 26 项几何、保存标记和消息断言后，被一条没有 URL 的 console 404 拒绝。原始 d654 工件 12386952692（run 39684592012、job 119521699217）没有 trace/HAR 或请求 URL，因此仅凭旧工件不能推断请求来源。e6 对应失败为 run 39688318647、job 119533321927。

## 根因与纠正

本地复用生产 `withHmrServer`，使用同版本完整 Chromium 156 后，真实 console.location 指向 `http://127.0.0.1:<本轮端口>/favicon.ico`。Autofill 分组需要完整 Chromium，suite 共用这个 browser；独立 HMR 页面原来没有显式图标。完整 Chromium 的隐式请求暴露了夹具资源缺失，原先 headless shell 路径没有暴露它。

修复在夹具源目录提供固定 SVG，并在 HTML 声明显式 `/favicon.svg`。没有过滤任何 404，也没有改变 HMR 候选、CSS、超时或支持预期。HTML 和图标同时进入运行时和 static 的 fixture hash。

## 错误和资源边界

新观察器记录 console、页面异常、HTTP 失败和请求中断的原始 URL、阶段、ISO 时间及可用的位置、状态、资源类型。所有错误进入原有门禁并写入 measurements.json；不会只留下通用文案。仅卸载自己的监听，关闭借用 browser 的自有 context，不删除其它监听。

复审发现回调结束后、服务异步关闭期间仍可能收到错误，而旧最终判定只看先前 failure。回归先证明晚到浏览器异常和 Vite error 都会错误地通过，再让冻结前的完整错误集合参与最终判定。浏览器主动清理前注销观察器，避免把主动关闭页面本身产生的事件混入活动阶段。

另一项既有缺陷是借用 browser 的 newContext 失败时，会把“没有创建 context”误认成“拥有 browser”。现在明确按借用身份清理：失败仍保留原始原因，但不关闭 suite 所有的 browser；自建 browser 在相同失败下正常关闭。该修复仅覆盖本 HMR runner，不把其它 runner 推断为已审计。

## 验证

定向 static 更新命令为 `CI=1 pnpm e2e:tailwind:static:update`；审查仅 index.json 的 fixtureHash 改变，随后 persistence 测试以 CI=1、--update=none 重新生成比较通过。新增两份测试已纳入显式合同入口。受管文件 ESLint 通过。

三引擎定向复验直接调用生产 runHmr，完整 Chromium 使用显式 executablePath；新增、替换、删除、刷新均执行，报告与截图保存在 `.tmp/hmr-three-engine/daaf5b5e-4828-42c5-89b4-a23ed6740c43/`。

## 适用边界

这是修复源码的本地定向证据，不复用此前原生预检，也不作为新一轮全面调度。完整注册覆盖、served bundle、ScrollView、未完成 Web variant 及 Mpx 性能失败继续保持 partial。

## 规则评估

现有错误不可过滤、资源按归属清理、夹具绑定哈希及 static 重验规则已经覆盖本问题，不新增全局规则。
