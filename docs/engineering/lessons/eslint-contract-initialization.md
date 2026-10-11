---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 25b0391ff40b619d7bcf35c783d2a1bbfeca1e0d
regressions:
  - scripts/agents/eslint-scope.test.mjs
---

# ESLint 路径合同与真实配置初始化

## 症状

全面流程 `20ab62a1-beee-476b-bf35-d7ac58d9178d` 的前 13 个阶段通过，第 14 阶段 `agents:test --update=none` 中，首个生成报告路径的 `isPathIgnored` 用例耗时 6463ms，超过 Vitest 默认 5000ms；其余 12 项通过。原始日志保留在该轮 `e2e/.artifacts/preflight/` 目录的 `full-regression-run.log`。同一基线的定向复跑在修改前为 13 项通过、总耗时 4.53 秒，没有再次触发超时。

## 根因与纠正

`new ESLint(...)` 仅构造实例，不加载仓库配置。ESLint 10 的 `isPathIgnored` 内部调用 `calculateConfigForFile`，由配置加载器在首次调用时动态导入 `eslint.config.js`，加载 `repoctl/tooling` 及完整插件图，并解析异步配置。此前模块顶层构造实例后直接运行路径断言，导致首个用例独自承担所有共享初始化成本。

在同一基线上用独立 Node 进程分段测量：导入 ESLint 107.03ms、构造实例 0.96ms、首次真实配置解析 2619.84ms，得到 332 条规则。随后三条忽略路径分别为 3.33ms、0.48ms、0.17ms；三条维护源码路径分别为 0.01ms、36.38ms、0.43ms。另一独立进程直接导入根配置耗时 2867.2ms，等待 composer 40.1ms，返回 54 个配置项。测量说明配置初始化与路径合同是不同工作，不证明首轮 6463ms 全部来自某个插件，也不证明 ESLint 启动性能得到优化。

将真实配置解析移到 `beforeAll`，通过同一个 ESLint 实例和原有 `overrideConfigFile` 加载维护中的脚本配置，并断言配置存在且检查规则非空。配置缺失、解析失败或初始化超时继续阻断。六条路径断言原样保留，不复制 ignore 列表、不 mock 配置、不缩小插件覆盖。初始化使用 Vitest 现有默认 10 秒 hook 超时，单项测试仍使用默认 5 秒；没有修改任何 timeout 配置。

## 验证

```sh
pnpm exec cross-env CI=1 pnpm agents:test --update=none --reporter=verbose
pnpm exec cross-env CI=1 pnpm exec eslint scripts/agents/eslint-scope.test.mjs
pnpm agents:check
```

修复后工程规则回归为 2 文件、13 项通过，六条 ESLint 路径断言为 0–35ms。定向 ESLint、规则检查及 `git diff --check` 通过。原首次失败和修改前定向通过结果均保留，不以反复重跑或提高 case 超时掩盖失败。

## 适用边界

此处验证的是仓库真实 ESLint 配置的忽略合同，不是性能门禁；完整配置仍在每个测试进程内首次加载，未宣称缩短其成本。此次未对首次失败样本进行细粒度跟踪，不能把该次耗时波动归因于特定插件、CPU 负载或缓存。修复后完整扩展流程由主工作流重新预检验收，本提交仅运行定向工程测试，不操作 IDE、设备或浏览器。未改变公开包或 demo，无需 change intent 或 static 基线更新。

## 规则评估

不新增 AGENTS 规则。保留真实配置覆盖，并在现有回归中明确共享初始化与单项断言的生命周期即可。
