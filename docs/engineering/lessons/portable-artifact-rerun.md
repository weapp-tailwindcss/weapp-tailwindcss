---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1277
baseline: 7ca0240f1b3a16f7cfd4ff0b41375d11672f351a
regressions:
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - scripts/ci/demo-matrix/matrix.test.mjs
---

# 局部重跑必须替换本分片的旧产物

## 症状

PR Gate run `37894524088` 的 Windows Node 24 Nuxt 分片首次在 Chromium 建立 HMR WebSocket 时报告 `net::ERR_NO_BUFFER_SPACE`。生产基线已通过，服务正常就绪；同一提交的 Windows Node 22、macOS/Linux Node 22/24 均通过。对失败分片及其依赖门禁做一次定向复测后，分片的生产、初始渲染、替换、新增、还原和刷新全部通过，但 Portable Demo Gate 仍报 `Failed result win32:24:web/nuxt-vite-tailwindcss-v4:web`。

## 根因与纠正

两次执行上传了同名 artifact `portable-demo-windows-latest-node24-web-nuxt-vite-tailwindcss-v4-0`：首次失败产物 ID `11610295374`，创建于 `10:20:47Z`；复测成功产物 ID `11610163645`，创建于 `10:42:56Z`，日期均为 2026-10-09。下载日志选择了首次失败的 ID。ID 数值大小不代表创建时间，按名称下载也不能保证选择当前执行的报告。

修正[分片上传配置](../../../.github/workflows/demo-matrix.yml)，为稳定的 OS/Node/shard 身份启用 `overwrite: true`。官方上传 action 在新上传前按名称删除旧 artifact，使汇总的名称与报告身份保持一对一；需要保留首次失败时，先按确切 ID 归档。汇总继续严格检查当前提交、pnpm 版本、完整清单、各阶段和成功状态，不跳过或过滤失败报告。

## 验证

新增的工作流契约断言在修复前因缺失同名替换策略失败，修复后 45 项工作流回归全部通过。9 项矩阵与门禁回归同时通过，继续拒绝失败、重复、缺失阶段和其他提交的报告。

首次失败与定向复测的原始日志、截图、产物和 API 元数据均已归档；复测成功产物按确切 ID 下载，包含全部六个阶段与五次 Vite 连接握手。最新提交的完整 CI 验收结果由该 PR 的检查和交付记录提供。

## 适用边界

该修复作用于 Portable Demo Matrix 的产物生命周期，不改变业务包、SSR、样式生成、超时、并发或门禁规则。Chromium 报告的连接资源错误与此前 Nitro renderer 的 manifest 错误分属不同边界；本次有限复测通过，不能据此认定具体宿主资源不足原因或永久修复 Chromium 网络栈。

## 规则评估

不新增 AGENTS 规则。现有远端跟进流程已要求保存首次失败、有限定向复测和核对当前提交，补充工作流契约与产物说明即可。
