---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 15dd772eea8056d6ec1b330cd14bccbb2b4113e2
regressions:
  - e2e/template-ide-contract.test.ts
  - e2e/template-ide-session.test.ts
  - e2e/template-ide-project-config.test.ts
  - e2e/wechat-session-boundary.test.ts
---

# 模板 IDE 渲染查询与截止时间

## 症状

2026-10-04 的模板 IDE 验收中，页面已导航到目标路由，Taro Vite 模板仍在渲染等待中失败。恢复环境后，以原实现重跑的 `4d01c914-9b4f-4738-86f5-ded65fe6e8cf` 通过本轮预检、矩阵契约和 MPX 模板；Taro Vite 模板约 43.4 秒后失败，首次错误为：

```text
Timed out waiting page rendered: selector=.min-h-screen dataset={}; reason=DevTools did not respond to protocol method App.callFunction within 4206ms; latest=[]
```

堆栈来自 `Page.waitForRendered` 和 `e2e/template-ide/runtime.ts`。随后发生的登录探针、失败截图、项目关闭和进程清理超时分别保留，不能将后续 `spawnSync ps ETIMEDOUT` 当作渲染首因，也不能从超时推断用户退出登录。

该轮报告保存在 `e2e/.artifacts/template-ide-verification/4d01c914-9b4f-4738-86f5-ded65fe6e8cf/report.json`，首次运行日志位于同轮 `e2e/.artifacts/preflight/4d01c914-9b4f-4738-86f5-ded65fe6e8cf/template-ide-run.log`。其余四个模板没有执行。

## 根因与纠正

仓库只需确认目标页面的 `.min-h-screen` 节点具有有限正尺寸，却先调用 SDK 的 `waitForRendered`，再额外调用 `renderedNodes` 重复测量。实际安装的 `@weapp-vite/miniprogram-automator@1.2.22` 中，前者可能先通过旧的 Page 查询路径等待元素，后者是公开的 App-Service 渲染查询接口。仓库原入口将验收契约绑定到较宽的 SDK 查询策略，也没有校验 `reLaunch` 返回路由。

独立诊断 `852f7562-d444-4cf8-a894-4f6da90fb98f` 保留相同 `reLaunch`，随后直接使用公开 `renderedNodes`：导航耗时 137ms，重新导航后的节点在 23ms 内测得 390×753，节点身份由 `_Ao` 变为 `_BY`；截图耗时 896ms，会话清理成功。证据保存在 `e2e/.artifacts/taro-protocol-diagnostic/852f7562-d444-4cf8-a894-4f6da90fb98f/` 的 `report.json`、`orchestration.ts`、`protocol.jsonl` 和 `post-relaunch.png`。该次报告的基础库版本为 3.8.6。

模板 helper 现在保留 `reLaunch`，严格比对返回的页面路由，只容许单个前导斜线的等价写法。请求 URL 的 query 与 SDK 页面 route 分开处理；不通过大小写转换、尾斜线清理或后缀匹配放宽目标身份。

路由确认后开始一个 15 秒渲染预算。每次公开查询的 timeout 为 `min(5000, 剩余预算)`；只有空结果或无效尺寸才等待 `min(220, 剩余预算)` 后再查。返回后再次检查截止时间，避免接受迟到结果；成功直接返回当次节点，不重复测量。公开接口的协议异常原样传播，不重试、不回退旧查询，也不修改 SDK 私有状态、版本名单或依赖。

## 验证

在基线实现上先补持久回归，36 项中 26 项按预期失败、10 项通过，无未处理 Promise 拒绝；修改实现后运行：

```sh
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-ide-contract.test.ts e2e/template-ide-session.test.ts e2e/template-ide-project-config.test.ts e2e/wechat-session-boundary.test.ts --update=none
```

4 个文件、57 项通过。新增回归覆盖正确页面与 query、错误路由零查询、延迟渲染、空节点、零值、负值、非有限及缺失尺寸、导航与渲染原始错误、每次 RPC 的剩余预算、晚到正尺寸和截止后零请求、零遗留 timer。

定向严格类型检查与改动文件 ESLint 通过：

```sh
pnpm exec cross-env CI=1 pnpm exec tsc --ignoreConfig --noEmit --target ESNext --module ESNext --moduleResolution Bundler --types node,vitest/globals --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --esModuleInterop --skipLibCheck e2e/template-ide/runtime.ts e2e/template-ide-contract.test.ts
pnpm exec cross-env CI=1 pnpm exec eslint e2e/template-ide/runtime.ts e2e/template-ide-contract.test.ts --rule 'prettier/prettier: off'
```

## 适用边界

上述真实证据支持仓库选择公开渲染查询边界，不能单独证明 SDK 或 IDE 内部故障的完整根因。原路径控制在 MPX 之后运行，成功诊断为单独的 Taro 测试，二者仍存在执行上下文差异。SDK 可能在导航元数据超时后返回合成页面；严格 route 与正尺寸证明目标页面有渲染内容，不额外宣称旧页面协议或 query 一致性已验收。

本提交尚未在真实 IDE 运行修改后的完整六模板用例。集成后必须重新预检，再执行原模板入口；独立诊断成功不等于六模板、完整 46 阶段或 500ms watch 验收通过。微信登录保护、会话清理与失败报告继续使用原边界。

本次仅修改 E2E helper 与回归，没有修改公开包、demo 或样式产物，不新增 change intent 或 static 基线，也不需要包构建。真实设备与浏览器操作由主流程统一负责。

## 规则评估

不新增 AGENTS 规则。已有公开接口、首次失败、登录态保护、环境预检和持久回归要求足够，本次通过实现与可执行测试落实。
