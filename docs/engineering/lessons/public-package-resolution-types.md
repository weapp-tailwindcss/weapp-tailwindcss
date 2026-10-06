---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: b5aec68e5569a8030fc990fa48c3e59ef4a7e328
regressions:
  - e2e/public-package-types.test.ts
---

# 公共声明隔离包解析工具内部类型

## 症状

独立 Node 项目使用实际构建的 RN compiler、tailwind、metro 声明，并设置 `skipLibCheck: false` 时，TypeScript 在 `local-pkg@1.2.1/dist/index.d.ts` 报出两处 `Cannot find name 'Args'`。

## 根因与纠正

核心包的公开运行时配置和 preset 直接引用 local-pkg 的 PackageResolvingOptions，导致消费者载入该工具完整声明。local-pkg 1.2.1 的 loadPackageJSON 与 loadPackageJSONSync 发布声明含 `Args[0]`，但不存在 Args 定义；它们与本包公开的 paths/platform 配置无关。官方 registry 本轮仍以 1.2.1 为最新版本。

公开配置改由本包维护等价的 paths/platform 结构，适配器仍调用原工具，TypeScript 在适配器调用处核对结构兼容。没有修改 node_modules、增加依赖 patch 或关闭声明检查；纯 Node 的编译入口也不需要 React Native peer。

## 验证

- 独立临时项目使用实际构建产物，旧公开声明稳定触发两项 Args 错误；修复后同一检查通过。
- 独立核心包回归保留 `strict: true` 和 `skipLibCheck: false`，消费 generator 与 preset 的实际声明，同时验证三种合法平台值和非法字段类型。
- 包解析配置的字段、取值与默认行为保持一致；适配器和 preset 的定向回归覆盖原有行为。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/public-package-types.test.ts --update=none`：实际构建核心包后，独立消费者通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/runtime-resolve.test.ts test/tailwindcss/runtime-resolve.unit.test.ts test/tailwindcss/runtime-options.test.ts test/presets/uni-app-x.test.ts test/tailwindcss/v4-source-package-resolution.test.ts --update=none`：29 项通过。
- 根类型、架构、ESLint、agents、README 和 release status 检查通过。

## 适用边界

此修复保护本包消费者的公开声明边界，不代表 local-pkg 的上游发布声明已修复。消费者如果直接使用 local-pkg，仍需等待其上游类型修复。

## 规则评估

不新增 AGENTS 规则。公开契约由负责模块维护，第三方工具保留在适配器内部，并以实际发布声明的消费测试防止复发。
