---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1231
baseline: 0d23056021e44c8f74e72bb5a1166b359c98cd2d
regressions:
  - packages/postcss/test/color-parser-bundle.test.ts
  - packages/postcss/test/tsdown-config.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/wxml/templeteReplacer.test.ts
  - e2e/template-contract.test.ts
  - e2e/canonical-template-build-smoke.test.ts
---

# 依赖更新 PR 的打包与工具链回归

## 症状

PR #1231 的首次 CI 中，更新命令契约仍要求旧代理入口；WXML 回归保留两条不再对应测试名的快照；canonical 模板仍固定 pnpm 12.4.1，与根目录 12.5.1 不一致。另有 Windows、Linux、macOS 四个 Default utilities 作业都报缺少 `bg-emerald-50_f80`，产物中的主题颜色声明也消失。

## 根因与纠正

命令契约改为断言新编排脚本，继续断言原参数。WXML 定向快照更新只删除两个孤立条目，当前用例预期未改动。七个模板同步 packageManager 和 pnpm 多文档锁文件中的工具链文档；逐字对比确认项目依赖文档未变，新增全部模板的 manifest/工具链锁文件一致性回归。

颜色问题不能由源码单测排除：仓库内颜色转换正常，独立打包安装后失败。候选包锁文件中，颜色解析器使用绑定 tokenizer 4.0.0 的 parser，而调用方使用绑定 tokenizer 4.0.1 的另一份 parser。上游 AST 类型判断依赖实例身份，第二份 parser 的节点被拒绝，随后兼容层按无法转换的颜色移除声明。

新增打包回归，在临时目录复制真实 parser 模块制造第二个实例，分别加载 ESM/CJS 产物。修复前 `oklch` 被标记为不支持；将颜色解析器、parser、tokenizer、calc 和 color-helpers 一同打包后，两种格式均输出 RGB。其余 PostCSS 插件保持原有打包策略，不改变兼容层删除规则或降低验收断言。为公开 PostCSS 包新增中文 patch intent。

## 验证

本轮环境为 macOS、Node 25.6.1、pnpm 12.5.1、Vitest 5.0.1，执行范围均为定向回归：

- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/color-parser-bundle.test.ts test/tsdown-config.test.ts test/color-mix-compat.test.ts --update=none`：11 项通过。
- `pnpm --filter @weapp-tailwindcss/postcss run build`：构建和声明检查通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/workflows.test.ts test/wxml/templeteReplacer.test.ts --update=none`：72 项通过，2 项既有跳过。此前单独执行 `test/wxml/templeteReplacer.test.ts -u` 删除两条孤立快照。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-contract.test.ts e2e/template-workspace-config.test.ts --update=none`：23 项通过。
- `CI=1 pnpm e2e:canonical-templates`：4 项通过，包含 uni-app、Taro Vite、weapp-vite 三个模板的冻结安装与实际构建。
- `pnpm e2e:windows-utilities --update`：针对 `e2e/fixtures/taro-webpack-default-utilities/expected.json` 重新生成基线，内容未变；发布版和候选版开发、生产构建均通过。随后使用 `CI=1 pnpm e2e:windows-utilities` 不更新基线复验，也全部通过。
- 修改的 PostCSS 配置/测试和模板契约使用 `pnpm exec eslint --no-ignore` 只读检查，通过。工作流测试及模板 manifest 在常规 lint 中被忽略；额外强制检查与 HEAD 对比，工作流文件的 62 条、模板 manifest 合计 9 条既有诊断均未增加。
- `pnpm release status` 消费新增 intent，计划 PostCSS 3.3.6 → 3.3.7，主包和 CLI 按既有依赖/fixed 配置联动为 5.5.8；没有执行版本写入或发布。
- `pnpm agents:check`、`git diff --check`：通过。

## 适用边界

本地只验证 macOS 上的目标链路，没有执行全仓或设备 E2E；Windows/Linux 仍需当前 PR head 的远端检查。初次 Expo iOS 日志显示编译零错误，失败在模拟器 `simctl openurl` 的 POSIX 60 超时，不以降低验证要求处理；后续 head 继续跟踪，若复发仅有界重试该失败项。

## 规则评估

不新增规则。已有独立安装验收暴露了源码测试未覆盖的实例身份问题，新增持久打包回归即可；无需扩大根规则或放宽门禁。
