# @weapp-tailwindcss/hbuilderx-runner

> [English](./README.md) | 简体中文

HBuilderX CLI 调用辅助包，用于本地 e2e、demo 脚本和后续 CLI 封装。

```ts
import {
  createHBuilderXRunner,
} from '@weapp-tailwindcss/hbuilderx-runner'

const hbuilderx = await createHBuilderXRunner({
  channel: 'alpha',
  cwd: projectRoot,
})
console.log(hbuilderx.resolution)

await hbuilderx.prepareProject({ cwd: projectRoot })

const launch = hbuilderx.startLaunch({
  cwd: projectRoot,
  platform: 'app-android',
  args: ['--deviceId', 'emulator-5554'],
})

// 业务侧等待产物或探针后主动停止。
await launch.stop()
```

该包只负责 HBuilderX 调用层稳定性，不处理 Tailwind 或小程序样式转译。

## 能力边界

- 同时识别 stable 与 Alpha，可通过 `channel: 'auto' | 'stable' | 'alpha'` 或 `HBUILDERX_CHANNEL` 选择版本。
- 将原生 CLI 路径、`listhost` 返回的 host 和 `version --host` 结果绑定到 runner 会话，避免另一版本的运行进程抢占命令。
- 封装 `project open/close`、`launch`、长驻运行、超时、最近日志与进程树清理。
- 将常见失败归类为可诊断的 `HBuilderXCommandError`，例如项目识别错误、配置加载失败、Android/iOS/Harmony 工具链缺失和命令超时。
- 提供 Android `adb`、iOS Xcode/simulator、Harmony `hdc` 的本地工具链探测函数，供 e2e 或 demo 脚本在运行前快速失败。

## 版本选择

未传配置时使用 `auto`。选择顺序如下：

1. 函数参数中的显式 CLI candidate/path；
2. `HBUILDERX_CLI_PATH`；
3. `channel` 或 `HBUILDERX_CHANNEL` 匹配的运行实例；
4. macOS 默认安装路径，`auto` 下 stable 优先于 Alpha。

macOS 默认路径为 `/Applications/HBuilderX.app/Contents/MacOS/cli` 和 `/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli`。Windows/Linux 的非标准安装请设置 `HBUILDERX_CLI_PATH`。

`resolveHBuilderXCli` 只返回已配置且存在的路径，不查询运行进程；`resolveHBuilderXCliInfo` 还需要返回 `isRunning`，因此保留操作系统查询。已配置路径的 runner 通过原生 CLI 的 host 握手连接实例。

当同一 CLI 匹配到多个 host 时，runner 会拒绝猜测。请设置 `HBUILDERX_HOST`，或向 `createHBuilderXRunner` 传入 `host`。

部分 HBuilderX 版本自身会拒绝 stable 与 Alpha 跨版本并行运行。runner 不会擅自关闭当前实例；目标版本无法启动时会抛出 `cli-instance-mismatch`，请关闭冲突实例后重试。

`runPnpmCommand`、`spawnPnpmCommand`、`hbuilderxPnpmArgs` 和同步 `startLaunch` 为兼容旧调用保留。需要固定 stable/Alpha 时应使用绑定 runner；`@dcloudio/hbuilderx-cli` 的 pnpm 包装器会重新按运行进程探测版本，无法提供同等保证。

## 超时与清理

`runCommand` 达到 `timeoutMs` 后先清理自己启动的进程，再等待真实 `close` 和最终日志。清理使用独立预算：POSIX 先发送请求信号，最多等待 1 秒，再发送 `SIGKILL` 并最多等待 1 秒；Windows 使用最多 5 秒的 `taskkill /T /F`，随后最多等待 1 秒确认关闭。默认独立进程组中的后代即使关闭管道、根进程先退出，也纳入已开始的清理。

业务超时后即使进程优雅地返回 0，结果仍是 `timeout`。`allowFailure` 只允许返回业务失败，不放行清理失败；清理失败通过 `HBuilderXCommandError.cleanupError` 和 `cause` 保留，主错误继续记录命令、cwd、退出状态和最近日志。Windows 部分终止失败不会因根进程关闭而被抹掉。

长驻命令必须在根进程 `close` 前调用并等待 `stop()`，重复调用复用同一次清理结果。自然关闭后注销数字 PID/进程组句柄，避免误终止后来复用该编号的进程；不会追踪主动脱离独立组的服务。`detached: false` 只确认所持有的根进程关闭。同步 `killProcessTree` 仅保留兼容的终止请求，不等同于清理成功。POSIX 进程组若仍含未回收的孤儿进程，或权限错误持续导致无法确认组已消失，清理会保守失败。
