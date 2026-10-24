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

## 隐式格式化器的配置合同

[PR #1316](https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316) 的验收准备中发现：不传 `--fix` 只能保证 ESLint 不写回文件，不能保证它不调用格式化器。`repoctl/tooling` 转发的 `@icebreakers/monorepo@5.10.3` 与 `@icebreakers/eslint-config@8.0.9` 默认启用格式化器；真实 CSS 文件的最终配置包含 `format/prettier`，该规则在普通 lint 中也会调用 `prettier.format` 进行内存比较。这与仓库禁止使用 Prettier 的规则冲突。

根配置显式设置 `formatters: false`，保留原有脚本和 TypeScript 检查范围。回归先确认两份仓库 CSS 文件真实存在，再通过同一个 ESLint 实例解析最终配置，拒绝启用的 Prettier 规则；不运行 formatter，也不以检查根配置字符串替代真实解析。关闭格式化器后，CSS 可以没有 ESLint 配置，此合同不额外引入 CSS 检查器。

旧配置下两个新增用例均失败；修复提交 `175e88451` 的定向合同为 1 文件、13 项通过，命令为 `CI=1 pnpm exec vitest run -c scripts/agents/vitest.config.mts scripts/agents/eslint-scope.test.mjs --update=none`。此结果只证明格式化器和路径范围合同，不代表 PR 的完整验收或 CI 已通过。

## 关闭格式化器后的独立样式边界

后续提交 `6a2e909970939dc006fba54399592c97664dda2e` 的 [PR quality and unit tests (1)](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40091306034/job/120866681403) 在 `pnpm lint` 首次失败，尚未执行单测。Node 为 `22.23.3`，61 个 CSS/SCSS 文件被 JavaScript parser 拒绝，另有 4 项原有 `no-console` warning。完整首次日志与准确提交已保存，未通过重跑替代诊断。

`@icebreakers/eslint-config@8.0.9` 在关闭格式化器后仍无条件追加覆盖 CSS、SCSS、Sass、Less、PCSS、PostCSS 和 JSON 的 `style/eol-last: off` 配置。这个覆写本身会让 ESLint 扫描独立样式；失去 formatter 的 plain parser 后，它们落入默认 Espree。仅断言 Prettier 规则关闭无法发现错误的语言分派。

根配置显式把这六种独立样式排除在 ESLint 的脚本与配置检查范围之外，继续关闭 formatter，不引入空 parser 或调整检查规则严重度。JSON 仍使用原有语义检查；Vue 等文件内嵌样式的宿主解析范围不变。独立样式原先由 formatter 检查格式，不存在可保留的 ESLint CSS 语义规则；其样式生成、转换和兼容性继续由仓库已有样式合同验证。

回归覆盖四个 CI 首败中的真实 CSS/SCSS 文件及六种样式后缀，同时明确保留 `package.json` 和维护中的脚本、TypeScript、native 构建脚本。使用真实 ESLint 配置，未 mock parser 或复制配置内容；另外解析忽略规则之前的完整配置图，防止 CSS 被忽略后掩盖意外注册的 Prettier 规则。修复前新增十个范围用例全部失败；修复后 Node `22.23.3` 的范围合同 25 项通过，工程规则域为 3 文件、78 项通过，`CI=1 pnpm lint` 返回 0，仅保留同样四项 warning。定向命令为：

```sh
pnpm exec cross-env CI=1 pnpm exec vitest run -c scripts/agents/vitest.config.mts scripts/agents/eslint-scope.test.mjs --update=none
pnpm exec cross-env CI=1 pnpm agents:test --update=none
pnpm exec cross-env CI=1 pnpm lint
```

这些证据仅确认 lint 配置修复，不代表该提交的其他 CI 或全面设备验收已通过。未修改公开包、demo 或样式产物，无需 change intent 或 static 基线更新。

## 规则评估

不新增 AGENTS 规则。保留真实配置覆盖，并在现有回归中明确共享初始化与单项断言的生命周期即可。
