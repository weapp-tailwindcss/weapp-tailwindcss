# 网站视觉基线规则

## 适用范围

- 本目录负责网站黄金截图的采集、审查、安装与来源验证。

## 核心职责

- 从 Playwright 原生报告附件取得截图身份，完整绑定源码、实际构建、渲染环境和截图合同。
- 将候选与已审查黄金图分开，安装使用同父目录暂存和原子重命名。

## 变更原则

- 禁止从失败、重试、缺项或未知跳过的报告安装基线。
- 禁止覆盖来源不明的现有黄金目录；历史源码身份不能成为强制重录的条件。
- 不复制 Playwright 匿名截图命名算法，不降低像素、超时或支持预期门槛。
- 仅操作本任务拥有的路径，拒绝链接、特殊文件和跨平台路径逃逸。

## 测试要求

- 校验路径、报告、PNG、审查记录和安装失败的负向回归。
- 真实三浏览器夹具必须证明 missing 采集、none 通过、错误样式失败且黄金图未变；后台运行并清理资源。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/visual-baselines scripts/browser-local.test.ts --update=none`
- `pnpm --filter @weapp-tailwindcss/website e2e:visual:test`
- `pnpm --filter @weapp-tailwindcss/website typecheck`

## 提交前检查

- 同步中文操作文档与规则索引，保留真实采集和审查记录。
- 合成夹具只能证明管线，不能登记为网站黄金基线。
