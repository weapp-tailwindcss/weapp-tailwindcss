---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 53f1bb95502e77a7b2a31dbc4818b06411a369b3
regressions:
  - e2e/wechat-service.test.ts
  - e2e/wechat-automator.test.ts
  - e2e/wechat-session-boundary.test.ts
  - e2e/ide-project-cleanup.test.ts
  - e2e/preflight-probes.test.ts
  - e2e/preflight-gate.test.ts
---

# 微信 IDE 登录态保护

## 症状

2026-10-02 本地全面预检 `f8e32b34-3011-4f9e-9660-7cd673856345` 初始 `islogin` 通过，随后的 `auto` 返回 `APPID_ERROR / 需要重新登录`。原逻辑仍等待 WebSocket 超时，然后执行 CLI 项目清理。用户发现 IDE 已退出登录。

## 根因与纠正

安装版 DevTools 2.02.2609231 的 MAIN 日志给出以下北京时间顺序：23:48:56.455 `startedByCLI`；56.467 本地 `hasUser/sessionActive=true`；56.674 `main-ticket expire/refresh`；56.681 收到 `ISLOGIN`；56.810 刷新返回 `40030`；56.811 `refresh logout` 并清除 userInfo；56.812 `logout-complete`；56.835 才收到 `AUTO`；23:49:28.953 才收到 `CLOSE`。

已安装 IDE 实现中 `40030` 对应 `DEV_INVALID_SIGNATURE`，票据刷新失败处理调用 `logout()`。`islogin` 只读本地用户布尔值，因此在刷新完成前返回了旧状态。官方 CLI 连接失败会隐式启动 IDE；上游 automator 1.2.22 的 launch 也会启动 CLI `islogin`。本仓把只读状态查询误当成无启动副作用的入口，触发了启动期鉴权，并未正确处理缓存状态竞态。不能将此次注销归因于之后才执行的 auto 或 close；日志也不足以判定失效签名的服务端原因。

修复将所有微信 E2E 接入已有 IDE 的官方 HTTP 服务，完全移除 CLI 执行和上游 launch。只读安装元数据与端口标记；服务未开启直接阻断。只允许登录状态查询、本轮项目 auto 和 close；不透传账号、票据或 CLI 参数。HTTP 错误、无效业务响应、超时或登录失效后，当前进程停止后续项目请求，保留现场。

共享 WebSocket 协议连接限制 Tool 操作，阻止通过 MiniProgram、Page、Element 或 tool() 发出退出、票据和会话缓存操作。原 `projectTest.ts` 的 close 改为项目级清理；该旧路径本轮未执行，不属于已证实原因。项目启动时保存 HTTP 服务身份，清理不重新发现 IDE；移除视觉流程超时后的旁路连接。路径按官方协议双重编码，保留字面量百分号、中文和 Windows 路径。

## 验证

- 定向回归使用 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/wechat-service.test.ts e2e/wechat-automator.test.ts e2e/wechat-session-boundary.test.ts e2e/ide-project-cleanup.test.ts e2e/preflight-probes.test.ts e2e/frameworkIdeReopen.test.ts e2e/preflight-gate.test.ts --update=none`。
- HTTP 协议回归使用本机合成服务，验证认证失败后零项目请求、同源任务重定向、正文超时、项目绑定与路径编码；不访问真实账号。
- 源码扫描覆盖全部受版本控制和新增的 E2E/脚本，禁止绕过会话边界导入原始 automator；微信边界及预检禁止子进程启动。
- 新入口首次真实预检 `f91f36f8-f529-414b-94bd-4e878ff5d8b9` 暴露页面创建期的 `rawPath ... is null`：原探针在进入等待循环前提前读取一次页面元数据。已将页面读取纳入本轮 marker 的有界等待，页面身份不符仍立即拒绝交互，并补持久回归。该失败和后续恢复均保留原报告。
- 修复后真实 `CI=1 pnpm e2e:preflight prepare`，run `b853cf58-5b87-4bbd-87bf-3a4732771e27`：微信 DevTools 2.02.2609231 的连接、按钮交互、数据/文字变化、PNG 截图和项目关闭全部通过。清理内及独立 HTTP 复查均确认 `login:true`；未执行微信 CLI。报告和图片位于本 worktree 的 `e2e/.artifacts/preflight/<run ID>/`。
- 最终定向回归 8 文件、121 项通过，0 失败、0 跳过，包含共享会话检查器的实际执行回归。严格 TypeScript、ESLint、AGENTS 与共享会话契约检查通过。旧共享会话检查器仍假定 HMR 重构前的函数名和调用位置，已同步到当前 callback 事务并补实际执行回归。
- 全面流程仍因 iOS 两台 Booted 模拟器未指定目标而阻断；computer use、verify 及完整扩展矩阵未执行。本条 verified 仅指登录保护根因、仓库边界与微信真实探针，不能当作全面验收通过。

## 适用边界

本机日志显示 23:58:11 用户扫码恢复登录，00:05:05 新窗口登录态仍有效。修复不读取、复制或恢复账号凭据，不修改安装版 IDE。直接 HTTP 能避免自动化冷启动；正常项目权限校验仍可能遇到服务端自然过期/撤销票据，无法由仓库代码保证账号永久有效。此时必须阻断并由用户恢复，不通过改动 IDE 内部认证逻辑伪造登录。

自动端口发现按官方 macOS/Windows Electron 布局实现；其他布局显式提供 HTTP 端口。协议升级时需要重新核对真实接口与登录保护。

## 规则评估

依据本次已证实的隐式启动副作用与用户要求，根规则新增保留微信登录态的硬边界，E2E 与预检规则指向统一会话入口，多端手册维护恢复步骤。保护由持久回归约束，不依赖手工维护入口白名单。
