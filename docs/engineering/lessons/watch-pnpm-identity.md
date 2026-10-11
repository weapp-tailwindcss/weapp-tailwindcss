---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 62d46fc5a001ad4d5e81b23c87457911ba5db920
regressions:
  - e2e/watch-pnpm-identity.test.ts
  - packages/weapp-tailwindcss/test/ci/pnpm-command.test.ts
---

# Watch 子进程的 pnpm 身份

## 症状

HBuilderX Alpha 5.31 的 uni-app x 微信 watch 诊断中，预检确认 pnpm 12.6.0，但实际子进程日志报告：

```text
This project is configured to use 12.6.0 of pnpm. Your current pnpm is v12.4.1
Corepack invoked pnpm with this version, and pnpm does not switch versions when running under corepack.
```

该警告只能证明工具身份发生漂移，不能直接证明它是 WXSS 引用错误或编译耗时的来源。

## 根因与纠正

根项目声明 pnpm 12.6.0，部分 HBuilderX demo 仍声明 12.4.1。watch 启动器通过 `which` / `where` 从 PATH 再次找到 Corepack 入口，再以 demo 为 cwd 启动；Corepack 按最近 manifest 重新选择版本，丢失预检和父进程已经确定的 CLI 身份。

共享启动器以前也只复用 JavaScript 入口，原生入口会回退 PATH。本机 pnpm 12.6.0 的生命周期环境实际使用 `<Corepack cache>/v1/pnpm/12.6.0/pnpm-native`，因此只复用 `.cjs` 的修复不足以解决问题。

统一从调用者环境的 `npm_execpath` 固定 pnpm 入口：JavaScript 和 Node shebang 脚本使用当前 Node，原生可执行文件直接启动，两者均不经 shell。入口在切换 cwd 前解析为绝对路径。无 pnpm 身份的独立调用继续使用 PATH；npm / yarn 入口不冒充 pnpm；显式指定但缺失的 CLI 直接报错。Windows 独立调用仍保留 `pnpm.cmd` 和原有 shell 行为。

提交 `35a559989` 的交叉审查发现，显式 `pnpm.cmd` 不在入口白名单中，原实现会把它误当作无身份调用并回退 PATH。后续回归先证实 7 种 Windows 包装名均未阻断，再明确拒绝 `pnpm` / `pnpm-native` 的 `.cmd`、`.bat`、`.ps1` 入口（大小写不敏感），错误码为 `ERR_UNSUPPORTED_PNPM_ENTRY`。无论包装文件存在或缺失，都在创建子进程前阻断；错误提示要求提供实际 JavaScript 或原生入口。这样无需 shell 拼接、重解释引号与特殊字符，也不猜测旁边可能属于另一版本的文件。pnpm 12.6 的实际 JavaScript 入口 `pnpm.mjs` 仍受支持。

这是进程启动边界修复，没有批量改写 demo 的版本声明。watch 的构建、开发服务和 Web 消费同一启动器。共享 helper 的 uni watch、weapp-vite watch、构建准备与 Gulp 调用方均已审查，均完整传递 `command`、`args`、`shell`。

## 验证

环境为 macOS arm64、Node 24.18.0、pnpm 12.6.0。所有 Vitest 回归设置 `CI=1` 和 `--update=none`。

- 修复前，真实临时子进程用例在“根版本 99.1.0、子项目版本 99.2.0”场景失败，只剩 CLI 版本偏离；修复后通过。测试使用本地版本分派 fixture，不依赖下载。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/watch-pnpm-identity.test.ts e2e/watch-command-lifecycle.test.ts --update=none`：16 项通过。覆盖 JavaScript、原生可执行文件、Node shebang、CLI 缺失、包装入口存在与缺失、独立调用、非 pnpm 入口、参数原样传递及取消后的资源清理。
- `pnpm --filter weapp-tailwindcss exec vitest run test/ci/pnpm-command.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：132 项通过，包含 Windows 原生与包装入口、相对路径和空格路径。
- `pnpm --filter weapp-tailwindcss exec vitest run test/ci/weapp-vite-e2e-watch.test.ts --update=none`：9 项通过。
- 使用工具项目的严格 TypeScript 选项，以本次四个源码与测试文件为入口检查依赖图，诊断为 0；这不是整个工具包的全量类型验收。
- ESLint 关闭 `format/prettier` 后检查本次文件；另执行 `git diff --check` 和 `pnpm agents:check`。

实际安装身份另通过忽略目录 `.tmp/pnpm-identity/` 的私有 package 生命周期验证：其 `identity` 脚本执行 `node --import tsx probe.mjs`，probe 导入真实 `spawnPnpm`，传入当前环境，以 `demo/uni-app-x-vdom-tailwindcss-v4` 为 cwd 执行 `--version`。临时 package 创建后执行的完整命令为 `rtk proxy pnpm --dir .tmp/pnpm-identity run identity`，输出活动入口为 `pnpm/12.6.0/pnpm-native`、用户代理为 `pnpm/12.6.0`，子进程输出 `12.6.0`，退出码为 0。修复前相同 probe 输出 `12.4.1`。原生回归 fixture 则复制或硬链接当前 Node 可执行文件为 `pnpm-native`，验证直接执行原生二进制而不转入 PATH。

## 适用边界

本记录验证 CLI 身份与进程生命周期，不代表 HBuilderX、微信 IDE、设备、WXSS 或性能验收。真实 watch 回归由汇总任务在整合后重新预检执行。`pnpm exec tsx` 在当前安装中不提供 `npm_execpath`，因此实际安装验证必须通过 pnpm 的 run 生命周期，不能把独立 exec 的 PATH 回退误报为修复失败。

本次未改变公开包行为、demo 源码或样式输出，不需要 change intent 或 static 基线更新。Windows 分支由命令契约覆盖，真实进程测试仅在 macOS 执行。

## 规则评估

沿用进程身份、跨平台、根因回归和证据分层规则，不新增 AGENTS 条目。保持启动器的单一实现和持久边界测试，避免通过统一 demo 版本临时掩盖子进程身份丢失。
