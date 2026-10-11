---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 02ed18b4549a3514e8956f086cf360bcdb3bf3ff
regressions:
  - packages/test-helper/test/dependency-update-scope.test.ts
  - packages/test-helper/test/pnpm-smart-proxy.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
---

# 依赖升级入口纳入 demo 并排除 uni-app

## 症状

`pnpm up:pkg:latest` 没有列出可升级的 `weapp-vite`。该依赖由 demo 和 starter
引用，而命令只筛选 `packages/*` 与 `packages-runtime/*`。

## 根因与纠正

按本次需求，`up:pkg` 与 `up:pkg:latest` 同时纳入 `demo/*` 和 `demo/web/*`，
排除目录名含 `uni-app` 的项目，以及使用 DCloud 工具链但目录名不含 uni-app 的
`issue-uview-plus-cssentries`。`up:uniapp` 继续使用 DCloud 专用升级工具。
筛选参数使用双引号，兼容 Windows 的脚本执行环境。

原代理脚本只要发现任意内部包筛选条件，就解除 Babel 冻结；加入 demo 后会误伤
Taro 工具链。改为所有正向筛选条件都限定内部包时才解除冻结，负向条件不扩大范围。
没有正向条件或同时选择 demo 时继续保留 `update.ignoreDeps` 中的 Babel 约束。

## 验证

先增加回归测试，旧实现出现 3 个预期失败：两个命令均未选中 weapp-vite demo，
混合筛选仍解除 Babel 冻结。修改后执行：

```sh
CI=1 pnpm exec vitest run --config packages/test-helper/vitest.config.ts packages/test-helper/test/pnpm-smart-proxy.test.ts packages/test-helper/test/dependency-update-scope.test.ts packages/weapp-tailwindcss/test/ci/workflows.test.ts --update=none
```

3 个文件、51 个测试通过。范围回归调用 pnpm 的 list 子命令，逐一检查 demo manifest：
声明 DCloud 依赖的项目必须被排除，其余 demo 必须入选，包含 Web 与 weapp-vite。
测试还检查 `@dcloudio/*` 与 Babel 冻结，以及专用 uni-app 升级入口。

## 适用边界

本次只修改命令范围，没有执行实际依赖升级，也未修改 demo 源码或样式产物，
不涉及 static 基线更新。保留已有框架依赖冻结规则，starter 仍不属于本次新增范围。
项目级排除不会隔离共享 catalog：升级普通共享依赖仍可能间接影响 uni-app 的解析版本，
不能将项目未被选中理解为整个依赖图不变。DCloud 包继续单独冻结。
筛选集成验证运行于 macOS，未执行 Windows、Linux 或多端全面测试。

## 规则评估

不新增 AGENTS 规则。现有专用框架升级约束已足够，使用可执行回归防止遗漏新增
uni-app demo 或重新放开混合范围的 Babel 升级。
