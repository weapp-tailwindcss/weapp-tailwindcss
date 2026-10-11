---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 712e9647507a76799ea6abe98c7f29fea5af60e3
regressions:
  - e2e/package-homepages.test.ts
  - e2e/preflight-evidence.test.ts
  - e2e/ide-project-cleanup.test.ts
  - e2e/template-ide-contract.test.ts
  - e2e/template-ide-project-config.test.ts
  - e2e/watch-command-budget.test.ts
  - e2e/hbuilderx-hmr-lifecycle.test.ts
---

# 本地全面测试阶段记录

## 症状

本轮从基线建立独立工作树，分阶段完成本地验收。遇到包主页错误、静态基线漂移、watch 总命令预算不足、IDE 全局清理及模板验收契约问题。后续在 Android uni-app x 的纯 HMR 验收中确认原生运行链路重启，最终完整矩阵未完成。

## 根因与纠正

具体修复、红绿回归和边界分别见 [包主页路由](package-homepage-routes.md)、[静态基线与门禁诊断](full-test-static-recovery.md)、[IDE 生命周期与模板验收](ide-project-lifecycle.md)。本轮未修改产品运行时 API，未放宽性能或纯 HMR 门槛。中文 change intent 仅涉及 cn、merge 的主页元数据。

## 验证

所有运行使用 Node 24.18.0、pnpm 12.4.1、macOS，本地 Vitest 设置 `CI=1`、`--update=none`。限定项目的基线生成单独运行并审查；每次恢复和源码修改后重新执行真实环境预检。以下为各阶段最近一次结果，不代表最终代码已重新完成全部矩阵。

| 阶段 | 结果 | 范围与限制 |
| --- | --- | --- |
| 工程检查 | 通过 | 规则、架构、支持矩阵、文档一致性、29 个包主页 HTTP 200、lint/stylelint、包构建、typecheck、tsd、双语言文档构建；后续重复构建包含缓存命中 |
| 工作区 Vitest | 6058 项通过，43 项跳过 | 635 文件通过、5 文件跳过；此前全工作区结果，后续测试工具变更另做定向回归 |
| 脚本入口 | 通过 | agents 测试及 73 项 demo-matrix 测试 |
| static | 578 项通过，33 项跳过 | 102 文件通过、11 文件跳过；既有条件跳过保留 |
| 构建与工作流 | 通过 | 多平台构建 52 项、demo 用户工作流 18 项、模板构建 50 项、模板 HMR 5 项、预处理器 |
| watch 与 Web | 通过，保留既有跳过 | 直接热更新 8 个 demo、165 个计时样本；完整 watch 12 项通过、12 项跳过；Taro Web HMR 4 项、通用 Web HMR 18 项及 uni-app H5 dev |
| 微信 IDE | 通过 | 框架 12 项、Issue 2 项、where/root 各 1 项、视觉矩阵 11 场景；框架套件原有可见性豁免见专项复盘 |
| 模板 IDE | 7 项通过 | 6 个模板的真实布局、截图和运行时错误检查，另 1 项覆盖登记；使用显式本机 AppID，退出后恢复配置 |
| HBuilderX | 通过 | 小程序构建 5 项；H5 页面/HMR 3 项；分组命令排除其他平台的 skip 不计为已执行 |
| Android | 2 项通过，1 项失败 | 普通 uni-app 仅通过产物和传输断言，未配置设备探针；uni-app x 因保存后 App Launch 被纯 HMR 断言拒绝 |
| 提交前定向回归 | 125 项通过 | 11 文件，覆盖主页、预检、watch、项目清理、模板配置/渲染及 HMR 生命周期；修改文件 lint、agents 检查、diff 检查通过 |

主要原始报告位于 `e2e/.artifacts/full-test-fixes/`：

- `2026-09-20T18-17-38.115Z/`：工程、工作区与脚本测试。
- `2026-09-20T18-37-35.508Z/`：预处理器、构建、工作流及旧 watch 失败。
- `2026-09-20T19-55-29.638Z/`：static、修复后完整 watch 及 Web HMR。
- `2026-09-20T21-19-10.920Z/`：微信 IDE 与视觉矩阵，截图保存在 `wechat-visual/`。
- `2026-09-20T22-41-57.492Z/`：模板、HBuilderX 与 Android；最后一轮预检为 `e88cb880-db66-499e-b8e2-1b2ea3e3085f`。

## 适用边界

Android 的无插件原生对照也重现保存后重启，当前阻塞来自 HBuilderX 5.26 原生更新链路，不能用修改 Tailwind 插件或放宽断言解决。后续 iOS、Harmony、App 视觉矩阵、React Native、Lynx、dev smoke、root-style-shell、uni-app-css-post 与 framework-contract 未完成；Windows/Linux 未实测，Harmony Vapor 未取得运行证据。

已完成修复可以独立交付，但本轮不得标记“全面验收通过”。恢复需上游纯 HMR 运行链路可用，或用户明确调整验收范围；之后重新预检并继续完整矩阵。未启动或等待远端 CI。

## 规则评估

不新增或放宽 AGENTS。使用既有门禁、一次性会话、逐阶段设备复查、项目级清理和持久回归执行现有要求。
