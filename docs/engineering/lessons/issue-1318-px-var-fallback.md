---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1318
baseline: e769e69b97c88b379a80d3cabca4fa20330b999a
regressions:
  - packages/postcss/test/px2rpx-var-fallback.test.ts
  - e2e/issue-1318-px-fallback.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
---

# Issue 1318：px 变量 fallback 转换

## 症状

设计宽度为 375 时，`48px` 转为 `96rpx`，但 `var(--nutui-48px,48px)` 中的 fallback 保持 px。
修复前，本仓库定向回归 9 项失败、2 项通过，真实 ESM/CJS 产物回归均失败；上游持久回归 14 项失败、1 项通过。

## 根因与纠正

实际实现来自 `postcss-pxtrans`，并非名称相似的 `postcss-pxtransform`。旧正则跳过整个 `var()`，共享 tokenizer 也保护了整个变量函数，因此修改默认倍率无法解决问题。

[上游 PR #53](https://github.com/icelib/postcss-plugins/pull/53) 的源码提交为 `a38ca3a08ac70154df718229d8c49555630a6bee`。
上游新增默认关闭的 `transformVarFallbacks`，开启时用栈区分变量首参数与 fallback，保护字符串、URL 和注释；关闭时保留原流式路径，自定义 `unitRegex` 保持优先级。
`postcss-pxtrans` 复用该入口，并保留大小写退出、平台倍率、过滤和回调契约；阈值使用绝对值，转换保留正负号。
本仓库只在 `px2rpx` 默认启用该选项，允许显式关闭。普通与延迟管线使用同一入口，避免重复换算；rem 行为保持既有契约。

临时承接为 pnpm 精确版本补丁：

- `patches/postcss-rule-unit-converter@0.2.6.patch`：完整 ESM/CJS、共享 chunk 与声明。
- `patches/postcss-pxtrans@1.0.7.patch`：完整 ESM/CJS 与声明。

补丁通过 pnpm 的 `patch` / `patch-commit` 内置命令 生成。pnpm 12 可能生成它自身无法应用的 rename metadata；本轮以 `diff.renames=false` 重新生成删除/新增格式，未手改锁文件。
两包的版本及导出路径保持 npm 原版契约。正式版本发布后，必须核对包含上述提交的等价修复，升级两个包，删除补丁与 workspace 登记，由 pnpm 重建锁文件并复验下述入口；不得只删除补丁。

运行时修复由 PostCSS 包的 ESM/CJS 构建打包，消费者不需要再安装本仓库补丁。公开 `Px2rpxOptions` 显式扩展新选项，避免发布声明仍引用旧上游类型导致退出配置无法通过编译。

## 验证

本轮环境为 macOS、Node 24.22.1、pnpm 12.14.0，验证对象为基线加本任务修复；以下均为定向验收，不代表本地全端验收。

- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none --coverage.enabled=false`：161 个文件通过，1889 项通过、3 项原有跳过。覆盖 375/750、嵌套、符号、科学计数、保护区域、显式关闭、阈值、过滤、回调、mediaQuery、replace:false、插件复用及配置缓存。
- `pnpm --filter weapp-tailwindcss... run build`：受影响依赖链与主包构建通过；`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false` 通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1318-px-fallback.test.ts -u --coverage.enabled=false`：先校验精确结果，再生成 `e2e/__snapshots__/issue-1318/vpt.css`；随后以 `--update=none` 复验 3 项通过。使用当前 VPT 的实际 `createStyleHandler` 策略，分别加载真实 ESM/CJS，并拒绝外部解析单位实现包；另模拟 npm 未打补丁的上游声明验证公开类型。
- `pnpm --filter @weapp-tailwindcss/postcss pack --pack-destination <本轮 artifacts>`：tarball 内 300 份 dist 文件逐字节匹配已验证产物，包含新公开类型。
- `CI=1 pnpm e2e:demo:matrix taro-vite-react-tailwindcss-v4:weapp taro-vite-react-tailwindcss-v4:alipay --update --build-only`：重新生成两项目 static 基线，无差异；去掉 `--update` 后复验通过。范围为生产构建和产物，不含 watch、IDE 或设备。
- 变更文件 ESLint、工作流契约、架构检查、`pnpm agents:check`、change intent 检查与 `git diff --check` 通过。

额外用 `noCheck:false` 检查 PostCSS 全包时出现 260 项存量类型诊断。通过只读 compiler host 还原基线的两个被改源码、排除新增测试，基线同为 260 项且诊断集合一致；未将原本使用 `noCheck:true` 的声明生成称作严格类型验收。新增公开类型通过独立消费者编译回归验证。

## 适用边界

Issue 未给出具体 VPT 版本或复现项目，本结论限定于已复现依赖链和当前 VPT 配置。变量名中的 `48px` 不转换；字符串、URL、注释和大小写退出规则继续保留。上游默认关闭，本仓库只为 px 转换启用；不扩展 rem 的公开行为。

PR Gate 的 core smoke 已纳入发布产物回归。两个 PR 需按各自最新 head 验收全部适用检查；本记录的本地通过不替代最终远端检查，也不涉及合并、npm 发布或关闭 Issue。

## 规则评估

不新增 AGENTS 规则。已有第三方补丁、包边界、失败回归、产物基线和 CI 最新 head 规则足够；通过持久测试保护运行时打包、公开类型和 CI 入口。
