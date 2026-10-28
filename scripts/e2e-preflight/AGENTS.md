# 全面测试环境门禁

<!-- agents:cwd=root -->

## 适用范围

适用于本目录的本地全面测试预检、工具探针、证据和会话管理。

## 核心职责

环境全部通过后才允许全面测试启动。操作步骤唯一来源为[多端手册](../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。

## 变更原则

- 不以版本、旧图片、skip、optional 或手写 passed 代替真实探针。
- computer use 必须来自当前 AI 工具会话，不能由脚本浏览器代做。
- 所有子进程有超时；只清理本任务创建的资源，不按进程名清理用户 IDE。
- 微信预检只读安装/端口元数据并连接 HTTP 服务，不执行包括 `islogin` 在内的微信 CLI。连接异常记录阶段、端口和标准错误代码，不推断 IDE 是否已打开；允许核对实例与任务归属后通过原生应用控制受控启动或重启，随后重新预检。票据失效时停止请求，禁止注销或重置登录。
- 不更改普通 hosted CI 和定向回归的运行条件。

## 测试要求

覆盖缺证、过期、跨 checkout、并发领取、设备掉线、超时、中断、进程和路径边界。门禁失败必须证明测试没有启动。

## 推荐验证命令

- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-gate.test.ts e2e/preflight-evidence.test.ts e2e/preflight-probes.test.ts --update=none`
- `pnpm agents:check`

## 提交前检查

至少实际执行一次 prepare；阻塞时交付报告，不自动启动全面测试。测试合成证据不得描述为真实设备验收。
