---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 9d847b01c8193ae68734dd8aacefaf8de8f0d94a
regressions:
  - e2e/wechat-service.test.ts
  - e2e/wechat-automator.test.ts
  - e2e/ide-project-cleanup.test.ts
  - e2e/preflight-probes.test.ts
  - e2e/preflight-wechat-probe.test.ts
  - e2e/wechat-session-boundary.test.ts
---

# 稳定版微信 DevTools 自动化会话与并发复盘

## 症状

稳定版微信开发者工具 2.02.2608080 的 `/v2/auto` 返回 HTTP 200 和窗口 ID，但后续 WebSocket 端口没有监听。上层因此在 `routeTo appLaunch` 处超时，表现为 `simulator launch failed`。此前 E2E 只发送 `project` 与 `autoPort`，没有覆盖稳定版要求的 `port`。

## 根因与纠正

稳定版的 `/v2/auto` 必须同时收到同一个自动化端口的 `port` 与 `autoPort`；成功回执是类似 `"s60"` 的窗口 ID，而不是旧实现假定的对象。服务层现在发送两个参数，接受并规范化稳定版窗口 ID，并在回执声明端口时校验它必须与本轮请求一致。项目在请求发出前绑定到原 HTTP 服务，超时或协议错误不会重新发现其他 IDE；清理仍只能通过本轮绑定服务执行。

同一稳定版 IDE 的 simulator 资源按实例共享。两个项目分别请求 38001、38002 时虽都得到 HTTP 200，但日志出现 `simulator launch failed`、`LoadApp: waiting for previous app to dispose`、`command ... already registered, override it` 和 `routeTo appLaunch timeout`。因此同一 HTTP 服务只保留一个项目租约；第二个项目、同一项目重复请求和跨服务迁移都会在触达 IDE 前拒绝。租约使用按用户和 HTTP 端口命名的原子锁覆盖不同 Node 进程，并在 close 成功后释放；连接失败、端口回执不符或页面未就绪时，`Launcher` 会清理本项目。不同 HTTP 服务的并发只有在用户已手动准备独立 IDE 实例、用户数据目录和端口后才有资格单独验收，脚本不会自动启动、切换或重启实例。

## 验证

在 macOS 当前已登录稳定版 IDE（HTTP 19355、基础库 3.17.2）上执行：

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts \
  e2e/wechat-service.test.ts e2e/wechat-automator.test.ts \
  e2e/ide-project-cleanup.test.ts --update=none
node --import tsx scripts/check-e2e-ide-shared-launch.ts
```

六份微信与预检回归共 92 项通过，ESLint 与 `git diff --check` 通过。真实单项目链路使用当前 `Launcher.launch` 打开临时项目、连接自动化 WebSocket、读取页面 marker、断开并调用 `closeWechatProject`；稳定版 2.02.2608080 / HTTP 19355 / 自动化端口 62399 通过，随后 `/v2/isLogin` 返回 `{"login":true}`，本轮锁文件已释放。没有执行登录、注销、清缓存、CLI 启动或 IDE 重启。

## 适用边界

该修复覆盖稳定版协议和同一 IDE 实例的会话所有权，不宣称厂商 simulator 支持同实例多项目并发。完整扩展回归仍须通过新的本轮全端预检；本记录的真实设备证据仅代表上述稳定版微信 IDE 单项目验收。

## 规则评估

不新增 AGENTS 规则。现有登录态保护、原服务清理和全面测试预检规则已经覆盖安全边界；持久回归补足了稳定版窗口 ID、双端口参数、项目租约、重复打开、跨服务归属和资源清理行为。
