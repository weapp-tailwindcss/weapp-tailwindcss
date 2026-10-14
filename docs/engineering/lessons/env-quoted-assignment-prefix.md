---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1296
baseline: 6b86e1da9df81965fc145e05ed88bb3e3c2a97ce
regressions:
  - packages/env/test/script-command.test.ts
  - packages/env/test/package-command.test.ts
  - packages/env/test/report.test.ts
  - packages/weapp-tailwindcss/test/framework.test.ts
---

# 引号赋值前缀不能改变命令位置

## 症状

在 main 基线的真实 tarball 中，Taro 依赖搭配 `"NODE_ENV=production" weapp-vite build` 被识别为 weapp-vite。`"NODE_ENV"=production` 同样误报；uni-app-vite 依赖搭配 `"NODE_ENV=production" taro build` 被误识别为 Taro。三个反例在 env、主包根与 framework 的 ESM/CJS 六入口产生 18 项失败。

## 根因与纠正

扫描器移除了引号，赋值跳过只读取 token 值，丢失变量名和等号是否被引用的信息。它错误跳过命令首词，将参数变成框架信号。新增 shell 赋值标记，只允许未引用、未转义的 NAME= 前缀；值中的引号或转义保持合法，续行不视为普通字符转义。

包装器参数有不同语义：env/cross-env 接收去引用后的参数，因此 `cross-env "NODE_ENV=production" weapp-vite build` 仍应识别 weapp-vite。检测报告继续复用普通检测规则，不制造错误候选、脚本证据或冲突。

## 验证

修复前先运行新增的 script-command/package-command 回归，确认引号首词误报。macOS arm64、Node 24.18.0、pnpm 12.9.1 上，修复后的 env 9 文件 299 项与主包定向 12 文件 99 项通过，均使用 CI=1、--update=none，无 skip。主包依赖闭包与 CLI 构建、env/main 类型检查、tsd、架构与规则检查通过。

[持久 tarball 验证](../../../packages/env/scripts/verify-package.mjs)覆盖 env 与 framework 的 ESM/CJS，并补验 workspace 主包根入口。另在仓库外正常安装本轮 21 个依赖闭包 tarball，通过 env、主包根和 framework 的 ESM/CJS 六入口完成 184 个补验条目，原 18 项反例全部转为通过；strict NodeNext .mts/.cts 编译通过。该额外包外消费同时复验七项 Issue 的平台、报告、官方 JSONC 与环境快照行为。

主要持久验证命令：

- `pnpm --filter @weapp-tailwindcss/env test --update=none`
- `pnpm --filter weapp-tailwindcss test test/framework.test.ts --update=none`
- `pnpm --filter weapp-tailwindcss... run build`
- `pnpm --filter @weapp-tailwindcss/env typecheck`
- `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`
- `pnpm --filter weapp-tailwindcss tsd`
- `pnpm --filter @weapp-tailwindcss/env test:package`
- `pnpm architecture:check`
- `pnpm agents:check`

上述结果基于 baseline 加本轮修复，baseline 自身仍存在缺陷。验证时修复尚未提交；本记录与回归随修复提交持久保存，PR 当前 head 的 CI 结果另外以检查页为准。

## 适用边界

本次针对 scripts 的静态命令检测，不执行用户脚本，不扩展为完整 shell 解释器。引号赋值词与合法值引用需分别处理；Windows 命令、路径与原有续行行为保留既有回归。本地结果不代表原生 Windows/Linux、Node 22、设备或 IDE 验收，也不代表 npm 已发布版本已包含修复。

## 规则评估

不新增 AGENTS 规则。现有规则已要求按语义固化失败回归和真实打包消费；补充可执行用例比重复规则更直接。
