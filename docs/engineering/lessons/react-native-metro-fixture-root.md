---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: ebf6e5cc88c8993ebe856544816d2f03ce4447a6
regressions:
  - packages/react-native/test/metro.test.ts
---

# Metro 单例解析测试必须绑定真实应用依赖根

## 症状

完整验收报告 `aa549` 在第 2 阶段的 [Metro 测试](../../../packages/react-native/test/metro.test.ts)失败 3 项：两个 Web 单例预期 `sourceFile` 却收到 `empty`，另一个 RNW 单例得到 `undefined`。原始输出保留在 `e2e/.artifacts/full-validation-20261014/full-run-aa549.log`；同轮另外 4 项失败由主任务分别处理，不归因于 Metro。

三项测试都把 `path.resolve(__dirname, '../../examples/react-native-expo')` 传给生产 resolver。真实示例位于仓库的 `examples/react-native-expo`，而该路径实际落到不存在的 `packages/examples/react-native-expo`。这属于测试 fixture 身份错误，没有证据要求修改生产解析策略。

## 根因与纠正

在独立工作树冻结安装 RN 与 Expo 示例的依赖闭包后，未经修改的 17 项测试在包 filter 和根 project 入口都通过。不能仅凭这次通过认定主树失败是安装缺失；随后在两个入口中记录实际值：`__dirname` 均为 `packages/react-native/test`，`import.meta.url` 均为该测试文件 URL；只有 `cwd` 分别为 RN 包目录和仓库根。两个入口计算的旧 fixture 根都为 `packages/examples/react-native-expo`，其 `package.json` 均不存在。相对于测试文件 URL 解析的真实根则为 `examples/react-native-expo`。

通过的差异来自依赖搜索环境。本工作树生成的 `node_modules/.bin/vitest` 会向 `NODE_PATH` 注入 `node_modules/.pnpm/node_modules`；该目录恰有 React 与 RNW。即使应用根不存在，`createRequire` 仍能从此全局搜索入口取得它们。原生 Node 不经该 shim 时，错误 fixture 根无法解析两包，真实示例根可以解析；根 `node_modules` 本身没有直接安装这两包。因此测试只断言文件路径包含包名，会把全局回退误算为应用根解析成功。

保留原有断言，仅增加临时身份日志，并通过同一 pnpm 启动已安装 Vitest 的 JS 入口来绕过 shim。在 `NODE_PATH` 未定义的实际记录中，原 17 项重现为 3 项失败、14 项通过；没有修改测试预期制造红灯，也没有改动或删除依赖来诱发失败。

修订后，三项测试共享 `fileURLToPath(new URL(..., import.meta.url))` 得到的真实示例根，并核对 fixture manifest 的包名。预期文件通过该示例 `node_modules` 中的绝对包目录解析，不能回退到全局同名包；返回对象必须完整等于 `sourceFile` 与该精确路径。带旧 resolver 的两项测试还断言它没有被调用，避免把回退到其他解析图误判为应用单例命中。临时身份日志在交付前移除。

## 验证

环境为 macOS arm64、Node 24.18.0、pnpm 12.9.1、Vitest 5.0.3。工作树从上述基线创建，以下修订后结果包含本次未提交测试改动，不把基线 SHA 误记为修订后的提交。依赖只在本任务工作树执行冻结过滤安装，没有复用或链接主树的 `node_modules`。

```bash
pnpm install --frozen-lockfile --filter '@weapp-tailwindcss/react-native...' --filter '@weapp-tailwindcss/example-react-native-expo...'
CI=1 pnpm exec node node_modules/vitest/vitest.mjs run packages/react-native/test/metro.test.ts --coverage.enabled=false --update=none --reporter=verbose
CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/metro.test.ts test/metro-watch.test.ts test/metro-refresh.test.ts test/metro-store.test.ts --coverage.enabled=false --update=none --reporter=verbose
CI=1 pnpm exec vitest run packages/react-native/test/metro.test.ts --coverage.enabled=false --update=none --reporter=verbose
```

绕过 shim 的同一命令在修订前为 3 项失败、修订后为 17 项通过；包 filter 的四个 Metro 文件共 31 项通过，根 project 入口的 17 项也通过。两种入口的身份记录保留为 `.codex-tmp/metro-resolver-identity-package.log`、`metro-resolver-identity-root.log`；红绿输出为 `metro-resolver-fixture-native-before.log`、`metro-resolver-fixture-native-after.log`，其他通过记录为 `metro-resolver-fixture-package-after.log`、`metro-resolver-fixture-root-after.log`。

新工作树尚未构建时，包类型检查先因 `@weapp-tailwindcss/postcss/native` 与 `weapp-tailwindcss/generator` 声明缺失而失败；这是当前树声明产物尚未生成，不能从主树借用产物掩盖。在本树执行 `CI=1 pnpm --filter '@weapp-tailwindcss/react-native...' run build` 构建依赖闭包后，`pnpm --filter @weapp-tailwindcss/react-native typecheck` 通过。另以继承 RN 测试配置、显式映射 `@/*` 到本树源码且只包含 `metro.test.ts` 的临时配置执行 `pnpm exec tsc -p .codex-tmp/metro-resolver-fixture-typecheck.json --pretty false`，也通过；未增设声明或忽略类型错误。构建及两项类型输出分别保留在 `.codex-tmp/metro-resolver-fixture-build.log`、`metro-resolver-fixture-package-typecheck.log`、`metro-resolver-fixture-test-typecheck.log`。

## 适用边界

本次仅修正测试 fixture 与断言，生产 resolver、依赖 manifest、版本 intent 和样式输出均无变化。没有新增 demo、样式用例或 static 基线变化。Windows/Linux 原机与原生 Metro HMR 未在本次新增验证；完整验收交由主任务集成后执行，故保持 `partial`。

## 规则评估

不新增 AGENTS 规则。现有真实消费根、依赖实际解析身份、独立工作树和不得用未复现问题制造生产补丁的规则已覆盖；用持久的精确路径断言约束本次边界即可。
