---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 3fd6603bcc0f2fb0770cb263f7465ce740cbbefe
regressions:
  - scripts/agents/check.test.mjs
  - packages/weapp-tailwindcss/test/ci/install-workspace.test.ts
---

# worktree 依赖目录与隐式安装隔离

## 症状

2026-10-29，Taro Web 单位修复已经在独立 worktree 提交，主任务整合为 `5a5609ced` 和 `3fd6603bc`。主任务第一次构建包时，`node_modules/.bin/tsdown` 指向子任务 worktree 的绝对 `NODE_PATH` 和相对脚本路径；子任务清理借用链接后，该入口失效，构建无法启动。

子任务此前的 109 条定向纯回归成功，不代表主任务的依赖安装仍然完整。两项产品源码提交未损坏，主任务受跟踪工作树保持干净；故障发生在未受 Git 跟踪的依赖命令入口。

## 根因与纠正

独立 Git worktree 只隔离受跟踪文件，不隔离额外挂载的可写目录。子任务最初把根 `node_modules` 链接到主任务；pnpm 拒绝后，改成本地真实目录、逐项链接其中内容，但仍把 `.bin` 和若干 workspace 包级 `node_modules` 链接到主任务。这个调整保留了共享写入通道。

触发命令为：

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4-engine-web-units.test.ts --update=none --coverage.enabled=false
```

该轮 pnpm 12.15.0 的执行前依赖校验触发自动安装。日志先输出 supply-chain 检查、锁文件最新和 `Already up to date`，随后因虚拟 store 不是本地真实目录而失败：`workspace hoist directory is not a real directory`。安装并非原子操作；失败前已经沿共享目录生成 shim。pnpm 提示安装失败后仍启动了测试，因此测试退出码也不能证明安装步骤没有副作用。

后续命令虽然使用 `--config.verifyDepsBeforeRun=false`，只能避免这一入口继续隐式安装，无法撤销前一次写入，也无法把共享依赖目录变为隔离目录。清理子任务自身链接没有删除主任务源码，却使污染后的主任务 shim 指向不存在的位置。

修正原则是每个 worktree 正常安装自己的依赖目录、虚拟 store、shim 和包管理器元数据，仅通过 pnpm 正常机制复用内容寻址 store。不能通过共享 `node_modules` 节省安装，也不能把 `exec`、`run` 或关闭自动校验视为只读与隔离承诺。

## 验证

只读审查了 481 个 workspace 命令入口，其中 62 个含子任务路径，修改时间集中在本机 `2026-10-29 06:48:47.132671–06:48:47.159086`，与触发安装同秒：

| 目录 | 含子任务路径的 shim 数 |
| --- | ---: |
| 根 `node_modules/.bin` | 46 |
| `packages/weapp-tailwindcss/node_modules/.bin` | 6 |
| `packages/postcss/node_modules/.bin` | 2 |
| `packages/postcss-calc/node_modules/.bin` | 7 |
| `packages/tailwindcss-config/node_modules/.bin` | 1 |

当时的根 `.modules.yaml` 与虚拟 store `lock.yaml` 修改时间仍为前一晚，未含子任务路径；已检查的 workspace 直接依赖软链也未显式指向子任务。没有事前逐字节快照，因此这些检查仅界定已确认的影响，不能证明所有缓存与元数据均未变化。

主任务保存了异常 shim 的 tar 证据。普通 frozen install 跳过重连后，主任务使用 pnpm 重建，没有手工改写 shim：

```sh
pnpm install --frozen-lockfile --force --ignore-scripts --offline
```

该命令复用 5,404 个包、下载 0 个包，34.4 秒后以 0 退出。再次逐项检查原 62 个入口，全部存在且不再含子任务路径：62 个恢复、0 个缺失、0 个残留。子任务借用链接已清理，自有 worktree 干净。

恢复后，主任务在 `3fd6603bc` 完成两个包的真实构建（执行会话 `78730`，exit0）。首次真实回归的测试夹具修正保存在 `ae6aff2fe`；包含当时两份测试未提交修正的源码运行 16 项生成器/Vite/Webpack 回归通过，模板源码和发布版模式各 4 项通过。这些定向结果证明命令入口恢复后能执行真实工具链；后续复制模板在第十项仍有产品适配失败，不能把 shim 恢复当作完整模板或全端验收。

本次规则与复盘使用仓库原有检查器验证：71 份规则、416 份工程文档、1,147 条命令、0 个错误；`git diff --check` 通过。检查器所需 YAML 依赖安装在自有临时目录并于结束后清理，没有重新借用共享 `node_modules`。

## 适用边界

本次没有修改公开 API、包版本或发布源码，也没有运行 npm 发布。故障属于本地多代理依赖隔离，不能归因于 Taro 单位修复。共享 Git 对象库和 pnpm 内容寻址 store 仍按各自正常工具机制使用；可写 `node_modules`、虚拟 store 与生成入口属于工作树自身。

已有回归路径检查规则文档和安装工作流约束，不模拟外部 pnpm 安装过程。此次真实行为以实际异常入口、安装日志、重装结果及后续真实构建为依据。

## 规则评估

根 `AGENTS.md` 的多代理规则增加依赖目录隔离要求，并明确 `pnpm exec` / `run` 可能隐式安装。受跟踪工作树干净只能证明源码没有额外改动，不能替代依赖目录归属检查。新增规范不要求修改产品代码或编写模拟包管理器的纯测试。
