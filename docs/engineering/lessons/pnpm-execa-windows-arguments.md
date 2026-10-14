---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1304
baseline: 9f6d8f20e83bebb77a6b9b1647922ffcd686d0ae
regressions:
  - packages/weapp-tailwindcss/test/ci/pnpm-exec.test.ts
  - packages/css-compat/test/package-paths.test.ts
---

# Execa 的 Windows 参数边界

## 症状

[PR 当前基线的 Windows Node 24 CSS compatibility job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38582918958/job/115920274275)完成构建与类型检查，但特殊路径打包回归失败：`pnpm pack --pack-destination` 收到包含 `css compat ~ #% 中文` 的路径后报 `unexpected argument 'compat' found`。131 项中仅此回归失败，后续公开 tarball 消费步骤未执行。

## 根因与纠正

共享 `execaPnpm` 将原生 child_process 的 Windows cmd 回退配置直接传给 Execa。`shell: true` 关闭 Execa 的自动转义并拼接参数；诊断输出中的 escapedCommand 有引号，不代表实际执行已正确引用。改为交给 Execa 自身处理 cmd 包装与参数转义，保留显式 pnpm CLI 选择、环境合并和参数数组。

Node child_process 使用的 createPnpmCommand 约定保持不变；其调用方不能直接删除 Windows cmd 所需的 shell 配置。该修复只调整 Execa 适配层。

## 验证

先新增 pnpm-exec 回归，确认 Windows fallback 将 shell 设为 true 而失败；原生 pnpm 入口对照通过。macOS arm64、Node 24.18.0、pnpm 12.9.1 上，修复后 pnpm-exec/pnpm-command 两文件 18 项与 css-compat 五文件 131 项通过，后者包含真实特殊路径打包及隔离安装。css-compat test:package、脚本 lint 和规则检查通过。均设置 CI=1，单测使用 --update=none，无 skip。

这些本地结果来自 baseline 加本轮尚未提交的执行适配修复；不代表原生 Windows 已验收。此记录为 partial，原生 Windows 应以包含修复的新 PR head 的 CSS compatibility 矩阵为准。

- `pnpm --filter weapp-tailwindcss test test/ci/pnpm-exec.test.ts test/ci/pnpm-command.test.ts --update=none`
- `pnpm --filter @weapp-tailwindcss/css-compat test`
- `pnpm --filter @weapp-tailwindcss/css-compat test:package`

## 适用边界

本次失败在 Windows runner 的真实特殊路径中观察到；macOS 回归不能代替 Windows 修复验收。Execa 9.6.1 内部的 cross-spawn 7.0.6 为无 shell 选项的 cmd 包装处理转义，与[上游说明](https://github.com/sindresorhus/execa/blob/main/docs/escaping.md)一致。固定入口身份和普通参数转义属于不同边界。

## 规则评估

不新增 AGENTS 规则。现有跨平台路径回归已捕获错误；补充执行适配回归并保留原真实消费检查，不改验收范围或跳过 Windows。
