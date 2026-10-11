---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1282
baseline: 70ff7cc0c0adba5ab22aa65d8429c80e086fdad2
regressions:
  - packages/weapp-tailwindcss/test/ci/install-frozen-config.test.ts
  - packages/weapp-tailwindcss/test/ci/install-workspace.test.ts
  - packages/weapp-tailwindcss/test/ci/install-memory-workflow.test.ts
---

# pnpm 11.9.0 冻结安装与更新配置边界

## 症状

[CI run 38129922231](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38129922231) 的 macOS / Node 22 兼容 job 在安装阶段两次 V8 heap OOM，尚未进入构建和测试。日志确认安装的是 pnpm 11.9.0、Node 22.23.2，且关闭了自动包管理器版本切换。两次 Darwin 实际可用内存分别为 3,030,990,848 和 4,079,222,784 字节，对应安装子进程 heap 1445 和 1945 MiB；已有资源预算没有错误，也不能因此调高预算。

尽管传入 `--frozen-lockfile`，日志仍重新解析约 6116 个依赖，而没有进入已提交锁文件的直接消费路径。重试和缩小过滤范围都无法纠正该行为。

## 根因与纠正

仓库 `pnpm-workspace.yaml` 的 `update.ignoreDeps` 是合法的依赖更新策略。pnpm 11.9.0 安装器却把该配置对象传入每个 project mutation 的 `update` 字段，`allMutationsAreInstalls` 的 `!p.update` 判断因而失败，冻结安装绕过 headless 路径并重新解析整个依赖图。

修复位于统一 CI 安装入口：每次 `install --frozen-lockfile` 同时传入 `--config.update=false`。该 CLI 配置覆盖只属于本次安装，不删除或改写 workspace 的依赖更新策略，也不修改调用者环境。冻结安装具有明确语义，因此即使调用者环境包含 `npm_config_update=true`，安装仍必须直接消费锁文件并拒绝 manifest 漂移。已有显式 Node heap 参数仍按原资源策略保留。

真实 pnpm 11.9.0 的对照证明 `--no-update` 和 `--update=false` 不能覆盖此配置对象；不能用它们代替 `--config.update=false`。`config get` 的展示结果也不能证明安装器最终收到的参数，验收必须执行真实安装。

## 验证

新增回归建立本地 workspace 和一个不属于 workspace 的 `file:` 依赖，没有 registry 依赖和 `packageManager` 字段，避免自动版本分派与单纯链接 workspace 的空物化。使用活动 pnpm CLI 生成锁文件，再调用真实 `install-workspace.mjs`；打印 Node 和 CLI 路径、Node 版本及 CLI 的 `--version` 输出，并断言安装 footer 版本一致。

解析证据使用官方 `.pnpmfile.cjs` 的 `afterAllResolved` 钩子：生成锁文件时先确认记录实际写入，清除记录后执行冻结安装。必须安装出此前不存在的准确依赖 manifest 与 JS 字节，产物 realpath 不能等于原始本地包；同时解析记录仍不存在，锁文件及 workspace 配置字节不变。修改 manifest 后检查 `ERR_PNPM_OUTDATED_LOCKFILE`，不得写锁文件或触发解析钩子。钩子内容在两阶段保持一致，因此锁文件中的 pnpmfile checksum 不发生变化。

macOS 本地验证使用 Node 24.18.0。pnpm 11.9.0 的 JavaScript 入口直接通过 `npm_execpath` 指定，修复前回归因未跳过解析而失败，修复后通过；pnpm 12.9.1 使用 Corepack 缓存中的实际 `pnpm-native` 入口，也通过相同回归。两者实际 CLI 包版本与 `--version` 输出分别为 11.9.0 和 12.9.1。不能以兼容版本的 exec 子命令认定测试身份：该命令在本地可能先隐式安装，测试子进程还可能经 PATH 回退后切换版本，因此本次使用直接 Vitest 入口保留已确认的 CLI 身份。

以下定向命令在 `packages/weapp-tailwindcss` 目录执行：

```sh
CI=1 npm_execpath="<pnpm-11.9.0实际JavaScript入口>" node ../../node_modules/vitest/vitest.mjs run test/ci/install-frozen-config.test.ts test/ci/install-workspace.test.ts --update=none --silent=false
CI=1 npm_execpath="<pnpm-12.9.1实际原生入口>" node ../../node_modules/vitest/vitest.mjs run test/ci/install-frozen-config.test.ts test/ci/install-workspace.test.ts test/ci/install-memory-darwin.test.ts test/ci/install-memory-workflow.test.ts test/ci/pnpm-command.test.ts --update=none --silent=false
```

兼容矩阵新增真实冻结配置回归及安装入口回归，以实际 Windows、macOS 和 Linux 的活动 pnpm 11 执行；工作流契约检查确保该用例持续接入。远端修复后的结果由 PR 最终准确 head 的 CI 记录确认，本地通过不能代替 hosted 环境证据。

### Windows 默认 reporter 的文案误判

[CI run 38135060800](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38135060800) 的准确提交 `70ff7cc0c0adba5ab22aa65d8429c80e086fdad2`、attempt 1，Windows / Node 24 与 Node 22 均完成真实 workspace 冻结安装和构建。安装日志明确跳过解析，分别耗时 1 分 41.3 秒和 1 分 25.3 秒，实际 CLI 都是 pnpm 11.9.0；两项兼容测试均为 367 项通过、仅新增 fixture 文案断言失败。

fixture 的安装退出码为 0，日志有 scope、策略校验和准确版本 footer，却没有固定的 `resolution step is skipped` 文案。该文案在 pnpm 11.9.0 的 `tryFrozenInstall` 内部晚于 `lockfileOnly` 与空锁判断，属于默认 reporter 展示，不是可移植的解析协议。本机未复现 Windows 的展示差异，不能仅凭缺少文案断言发生全量解析。

改用上述实际物化与官方解析钩子后，将真实安装器恢复为不含 `--config.update=false` 的旧实现，准确 pnpm 11.9.0 回归因再次写入 `resolved` 记录而失败；恢复覆盖后通过。pnpm 12.9.1 同用例也通过。准确源码中，`afterAllResolved` 只在真实解析完成后执行，冻结路径不会调用它；先校准钩子再检查新物化，排除探针没加载或只写锁文件的空断言。该测试纠正保留原始 Windows 失败，并等待新提交的远端矩阵验证，不通过删断言或反复重跑将旧结果改为成功。

## 适用边界

只修复统一 CI 安装的冻结语义，不修改依赖更新命令、锁文件、workspace 策略、测试矩阵或内存预算。回归允许任何活动 pnpm 版本，但本轮本地实测仅覆盖 11.9.0 和 12.9.1；Node 22 与 Windows/Linux 的实际安装由远端兼容矩阵验证。安装语义恢复不代表所有构建、Watch、性能、IDE 或设备验收完成。

## 规则评估

不新增 AGENTS 规则。以真实 CLI 回归约束冻结安装、配置优先级和工具链身份，避免删除合法维护配置或提高资源预算来掩盖解析路径错误。
