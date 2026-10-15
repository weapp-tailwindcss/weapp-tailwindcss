---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 49b48d65acee7bf3d01c33e1ecf293b0f18ce163
regressions:
  - website/scripts/browser-local.test.ts
  - website/scripts/local-worker/browser-budget.test.ts
  - website/scripts/local-worker/command.test.ts
---

# 网站浏览器命令的编排容量

## 症状

本地网站验收将全部三浏览器用例交给一个命令，沿用通用执行器的 30 分钟默认预算。原范围包括 1204 个实际截图与 546 个实际功能用例；新增页面加载回归后功能及 fixture 共 585 项，真实 CLI 发现 2397 个声明槽，其中包含既有 skip。

完整执行仍在测量。已有局部测量为：原功能范围约 6.6 分钟，其中 1 项首次超时后重试通过；采用新加载 helper 的 Chromium 桌面与移动共 602 张截图用时 911.6 秒，随后 Firefox 首批约 1.6 秒/页。此时尚余 Firefox 294 页、WebKit 301 页以及候选功能范围。样本说明固定总预算存在容量不匹配风险，**尚未实际触发或复现 30 分钟截断**，也不能由这些局部速度证明剩余浏览器的耗时。

后续同轮基线生成在第 610 项首次失败：Firefox 桌面 `/docs/ai/ai-coding-deployment-guide` 的 `toHaveScreenshot` 超过原 60 秒预算，关闭时另有 `screencast.showOverlays: Target closed`；此前 609 项通过，后续停止。后续诊断已确认首次错误为 `Page.screenshot: Cannot take screenshot larger than 32767`：原始页面为 1280×44512，61 次重试消耗 58.555 秒；同页 WebKit 的原生全页截图以 1280×44496 成功。这是单例截图的浏览器能力边界，与整体命令容量相互独立。本次总预算修改不修复或放行它，也不调整其断言时间；实际 30 分钟聚合截止仍未复现，完整矩阵待验收。

## 根因与纠正

通用命令预算与测试规模没有关联。修正限定在网站调用侧：先用同一 Playwright CLI、配置、三项目、URL 和禁止更新截图参数执行 `--list --reporter=json`，再从嵌套 suite/spec 的项目用例中统计声明槽。skip 也计入容量，不复制路由或平台跳过条件。

浏览器命令预算为 `max(30 分钟, 2 分钟启动余量 + 声明槽数 × 2 秒)`。2397 槽对应 4914000 毫秒，即 81.9 分钟。该值只表示完整命令的编排容量，不是单个测试的耗时保证，也不替代性能门禁。通用 `runLocalCommand` 默认仍为 30 分钟；测试与 expect 的 60 秒、单 worker、三浏览器、最多 5 像素差和禁止更新基线均保持原值。

计划发现单独使用 20 秒有限预算，经过已有进程生命周期与取消信号。计划错误、空计划、结构无效、超出 Node 计时器范围或取消均阻止实际测试启动；临时计划放在系统临时目录，成功与失败均清理。发现不启动浏览器，不访问页面。

## 验证

本次基于上述提交叠加未提交修复，环境为 macOS、Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1：

- 冻结安装 `pnpm install --frozen-lockfile` 通过。
- 修复前新增编排回归 7 项失败：原入口没有先发现计划、没有传入计算预算，且无效计划不会阻断后续调用。此合成回归不代表真实 30 分钟截断已复现。
- 定向回归通过，共 6 个文件、63 项测试。包含真实 CLI 发现，以及嵌套多项目计数、无效计划、预算传递、取消、首次 stderr 与后代清理。命令：`pnpm exec vitest run --project=@weapp-tailwindcss/website website/scripts/browser-local.test.ts website/scripts/local-worker/browser-budget.test.ts website/scripts/local-worker/command.test.ts website/scripts/local-worker/server.test.ts website/scripts/local-worker/process-lifecycle.test.ts website/scripts/local-worker/windows-lifecycle.test.ts --update=none`。
- `pnpm --filter @weapp-tailwindcss/website typecheck` 通过。新 worktree 首次检查缺少运行时依赖声明，先定向构建 escape、runtime、cva、merge、variants，再复验通过；未改变仓库文件。
- `pnpm exec eslint website/scripts/browser-local.ts website/scripts/browser-local.test.ts website/scripts/local-worker/browser-budget.ts website/scripts/local-worker/browser-budget.test.ts website/scripts/local-worker/command.test.ts` 通过。
- `pnpm agents:check` 与 `git diff --check` 通过。
- 完整网站三浏览器、完整扩展矩阵和真实总耗时仍由主任务在新预检与最终提交上验收，当前记录不将其视为通过。

## 适用边界

只调整私有网站测试的命令编排容量，不修改页面 helper、请求排除条件、快照或产品行为，不需要公开包 change intent。该预算尚需完整测量审查；它没有授权扩大 GA 排除范围、放宽 60 秒断言、增加 worker、降低截图阈值、缩小覆盖或放松性能 guard。其他操作系统尚未实测。

## 规则评估

不新增 AGENTS。沿用已有有限预算、取消、进程归属、失败即停止调度与中文复盘规则，以调用侧回归固定边界。
