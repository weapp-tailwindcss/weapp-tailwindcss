---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38115119083
baseline: 0be08166231418ea142637d028063a435edb7df1
regressions:
  - e2e/apps-generator-mode-compare.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css-deferred-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-universal.integration.test.ts
---

# Coverage Nightly 的框架选择器修复与生成器基线

## 症状

2026-10-11 的 E2E Coverage Nightly 在 Ubuntu Node 22、Ubuntu Node 24 和 Windows Node 22 的 static shard 4 均失败于生成器比较用例。三种宿主产生相同差异：Taro Vite React 小程序的 CSS 总字节数由 428724 增至 429062，选择器由 2256 增至 2258。

## 根因与纠正

普通分包源码已包含 `group-[:nth-of-type(3)_&]:block`。此前 Tailwind 生成的规则含通配选择器，被 Taro 的框架 PostCSS 管线过滤。Watch 修复在生成器输出进入框架过滤前完成元素兼容，并保留原始 class 身份，最终 class 转译仍由原有小程序转换阶段负责。该修复恢复了源码实际要求的规则，但没有同步生成器比较入口的 static 基线。

限定 Taro Vite React/Vue3 重生成比较入口，逐项核对产物。唯一 CSS 差异位于 React `sub-normal/pages/index.wxss`：新增 `:nth-of-type(3) .group view.group-_b_cnth-of-type_p3_P__n_B_cblock` 与对应 `text` 选择器，两条声明均为 `display: block`，来源标记均指向已有分包 class。该产物由 5872 增至 6210 字节，选择器由 30 增至 32；Vue3、小程序其他 CSS 文件及 Web/Web compact 产物没有内容变化。

同步保存该 CSS 文件、项目 README，以及 JSON、英文和中文汇总报告。限定更新通过现有项目/平台身份合并机制保留其他项目行，没有把未运行项目的既有报告当成本轮生成结果。本轮只补齐已修复公开行为的消费基线，不调整算法或新增发布 intent。

## 验证

- `CI=1 pnpm install --frozen-lockfile`：在新独立工作树安装准确锁文件。
- `CI=1 pnpm --filter weapp-tailwindcss... --filter './packages-runtime/*' run build`：构建本工作树实际依赖闭包。
- `CI=1 E2E_PROJECT_FILTER='^taro-vite-(react|vue3)-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts -t 'builds retained demos' -u`：1 项通过，10 项因名称过滤未执行，写入 41 份快照；新工作树重生成与首次完整更新的差异一致，审查后的实际内容变化仅上述 5 个基线文件。
- 同一限定命令改为 `--update=none`：1 项通过、10 项因名称过滤未执行，88.80 秒；真实构建产物与提交基线一致，没有自动更新快照。
- `pnpm agents:check` 与 `git diff --check`：规则、文档命令和空白检查通过。

首次独立工作树完成限定基线更新后，在禁止更新的复验期间目录及 Git worktree 注册记录被移除，Vue H5/Web compact 的 cwd 因而不存在。该次复验按中断记录，不算通过，也没有还原或清理其他目录；新工作树从同一准确 head 重做生成和验证。

## 适用边界

本地证据仅覆盖限定项目的静态编译和生成器产物，不代表 IDE、真实设备、HMR 或新提交的完整 Nightly 已通过。记录中的远端运行绑定原始 head，原 head 的成功阶段不能用作后续提交的验收；完整新 head 的矩阵仍需独立核对，因此保留 partial 状态。

## 规则评估

不新增 AGENTS。现有规则已要求样式输出行为变化同步受影响项目的 static 基线；本次补齐的是同一共享管线的生成器比较消费入口，并保留具体 CSS 语义和范围审查。
