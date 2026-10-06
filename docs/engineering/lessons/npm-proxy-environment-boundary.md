---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 350ef0af8109e48aa8fa699066ea1bb19b3108a5
regressions:
  - scripts/ci/demo-matrix/turbo-network.test.mjs
  - scripts/ci/demo-matrix/turbo-cache.test.mjs
---

# npm 超时与子进程代理边界

## 症状

本地扩展回归的 `release status` 请求官方 npm registry 时发生 TLS 失败。恢复时对同一官方地址进行直连和现有系统代理对照：直连仍超时，代理路径保持证书校验并取得 HTTP 200。当前命令行没有代理变量，macOS 系统代理不会自动成为 Node 和包管理器的进程环境。补齐本地任务环境后，Node 原生 HTTPS 请求和真实 `pnpm release status` 均通过。

这组证据说明本次网络路径差异，不能将过去代理未启用时的所有失败都归因于环境变量，也不能由 registry 可达推定 IDE、设备或全面验收通过。

## 根因与纠正

工作流与多数直接子进程继承环境，但根 `build`、`tsd` 等入口还经过 Turbo。默认 strict 模式会过滤未列入允许范围的变量；只在父进程设置代理仍不完整。离线临时 workspace 启动真实 Turbo 构建子进程，复现所有标准代理变量及 `NODE_USE_ENV_PROXY` 均丢失，而无关变量同样被过滤。

根配置现在通过 `globalPassThroughEnv` 透传这些网络变量。保留 strict 模式，只放行必要键名，不将本机代理地址写入仓库。代理属于网络传输配置，不应改变构建产物身份，因此不用 `globalEnv` 将其纳入缓存 hash。这个缺口独立于直接执行的 `release status` 失败；没有证据证明先前构建任务因此失败。

## 验证

`scripts/ci/demo-matrix/turbo-network.test.mjs` 使用真实 Turbo 与临时 workspace，不访问外网。修复前子进程代理值全为缺失，修复后完整收到大小写变量和 Node 开关，无关变量仍被过滤。第二个用例确认改变代理地址不改变任务 hash；已有缓存恢复和构建开关回归继续验证原有语义。

```sh
CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/turbo-network.test.mjs scripts/ci/demo-matrix/turbo-cache.test.mjs --update=none
```

上述 2 文件、6 项通过。首次失败记录保存在本轮本地 artifacts，未覆盖失败样本。

## 适用边界

本地配置与恢复步骤统一见[多端手册](../../../e2e/LOCAL-MULTI-PLATFORM-E2E.md#包源网络与代理)。保持官方 registry 和 TLS 校验；本机服务必须通过 `NO_PROXY` 直连。工具是否使用代理仍取决于自身实现，Java/Gradle 等需要按实际失败分别诊断，不能仅凭环境变量存在宣称所有工具联网成功。

## 规则评估

不新增 AGENTS。现有网络失败诊断与本地预检规则足够，通过 Turbo 配置和持久回归补足子进程边界。没有公开包行为或样式产物变化，不新增 change intent 或 static 基线。
