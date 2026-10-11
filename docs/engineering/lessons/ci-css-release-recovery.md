---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1197
baseline: e82055a63e2eea5e049da690de1bca575aa020d3
regressions:
  - packages/weapp-tailwindcss/test/bundlers/shared/generator-css/generated-cleanup.test.ts
  - packages/weapp-tailwindcss/test/bundlers/shared/generator-css/user-css.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-css-composition.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-css-composition.unit.test.ts
  - e2e/uni-app-vite-tailwindcss-v4-layer-output.test.ts
  - packages/weapp-tailwindcss/test/ci/repoctl-release.test.ts
  - demo/__tests__/wxss-output.test.ts
  - e2e/taro-ci-coverage-matrix.test.ts
  - e2e/taro-vite-react-tailwindcss-v4.test.ts
  - e2e/template-contract.test.ts
  - packages/weapp-tailwindcss/test/defaults.test.ts
---

# CSS 清理、框架组合与发布恢复回归

## 症状

- Release 的 WXSS 检查把 `.small` 工具类误认为全局 `small` 标签。
- v4 根规则的变量名前缀清理会误删用户变量；恢复原始根规则又会让未转换的 `rem` 覆盖已转换的 `rpx`。
- 框架 vendor CSS 按规则集合去重后，`16 → 32 → 16` 的最后一条覆盖消失。NutUI 的组合选择器与后续单选择器覆盖也受到影响。
- npm publish 与 tag 推送成功后，GitHub Release POST 返回 502。现有说明修复入口只能修复已有 Release。

原始失败：[34748944107](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34748944107)、[34748944100](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34748944100)。

## 根因与纠正

1. WXSS 禁止片段改为 PostCSS AST 签名匹配，覆盖标签、类、伪类、多选择器和全部已有 Preflight 片段。
2. 从生成阶段传递原始及转换后的声明来源，按条件上下文、属性、值和优先级清理。只有数值小数前导零被归一化；未知来源与用户覆盖保留。补齐删除声明后标记变化、单独 `:host` 的用户变量及空白格式回归。
3. 用户样式转换之后，裸选择器补偿只补没有被转换结果表示的规则，避免重新插入原始 `rem`。
4. 框架产物用于恢复用户 CSS 覆盖顺序，同时保留生成侧已经确定的层位置。早期无条件移动规则和按产物大小跳过恢复的做法均不正确，见下方补充纠正。真实生成器测试分别执行 legacy 与 graph，并精确验证用户变量、单位转换及重复规则顺序。
5. 合并多个 CSS 输入后，只保留开头的一条 `@charset`；不在构建输出目录直接写文件。
6. 模板按 semver 范围能否覆盖当前稳定版验收，不要求范围字符串一致。Taro 配置通过执行实际 AST 中的 `designWidth` 表达式验证 POSIX、Windows、相对路径、盘符和相邻目录。
7. 为实际实现包 `@icebreakers/monorepo@5.5.0` 提交 pnpm patch。Release API 的重试限定四次，遵守限流等待，POST 响应不确定时先按 tag 查询；不重跑 npm publish。
8. 显式 `release notes repair --create-missing --tag` 支持 dry-run。核对 npm 精确版本、本地与远端 tag、目标提交内的包名和版本，再复用原说明生成逻辑补建缺失 Release。

## 初次修复阶段的验证记录

本次在独立 `codex/ci-css-release-recovery` worktree 验证；以下是初次修复阶段的本地记录；最终实现的重新验证见后面的“本轮验证”。

- `CI=1 pnpm test --update=none`：540 文件、5278 测试通过；5 文件、47 测试既有跳过。
- CSS 定向集合：13 文件、288 测试通过；新增清理器、框架组合和 repoctl 集合另行复验，50 测试通过。
- `CI=1 pnpm test:release`：58 测试通过、4 跳过；附加发布插件测试 2 项通过。
- `CI=1 pnpm e2e:issues-977-978`：8 项通过。
- Taro coverage、模板范围和 canonical smoke：3 文件、20 项通过。
- `pnpm --filter weapp-tailwindcss build`：通过，真实 demo 使用本 worktree 的新构建。
- `CI=1 pnpm e2e:static --shard=1/3 --update=none`：21 文件、118 测试通过；6 文件、18 测试跳过。
- static 三个分片和 apps-generator 已完成禁止更新复核：分别 107/122/130 项通过，既有跳过 18/10/3。
- `pnpm typecheck`：未通过。当前与未修改基线各 445 条诊断，按文件和错误码对比无新增。不能据此宣称严格类型全绿。
- ESLint：使用仓库默认范围检查改动代码；对新增测试与框架组合测试额外取消忽略进行检查。全仓默认忽略的历史 demo/大型测试文件不能冒充已通过强制 lint。

## 快照语义

限定更新 Taro Vite React/Vue v4 与 uni-app Vite v4 的 static 基线，随后以 `--update=none` 验证。

- 两套 NutUI 产物按选择器、条件上下文、声明属性和优先级统计，React 6707 项、Vue 5233 项，未缺失声明；大量 diff 来自重复副本减少和保留框架已处理的格式。
- 对照 NutUI 原始 CSS，`.nut-tabs-titles-item-smile` 的 `bottom` 最后应为 `var(--nutui-tabs-titles-item-smile-bottom, -10%)`，`.nut-indicator-white .nut-indicator-line` 的 `opacity` 最后应为 `0`。旧基线的 `15%` 与 `1` 来自错误覆盖顺序；真实构建行为测试固定这两个纠正。
- uni-app 保留的 `--test-color`、`--color-test`、字体与色彩变量来自 `App.vue`，runtime 的状态栏高度和窗口偏移仍在主样式中。

## 补充纠正：大产物与层位置

- 超过 250 KB 就跳过恢复会丢失框架来源、编码声明和用户规则，不能作为性能优化。移除全部大小短路，用条件上下文、选择器、声明值、优先级和声明顺序建立 AST 索引。
- 将所有框架规则移到生成结果尾部也不正确：uni-app 的 `wx-button { background: #000 }` 和 components 层必须位于 utilities 之前。对覆盖序列保留生成侧已匹配前缀，从首次缺失处恢复框架侧后缀。
- 逐条删除 PostCSS 节点会在大数组中反复移动元素，改为每个容器一次批量重建；主题来源声明延迟解析，并在同一恢复周期共享索引。相邻完全相同的规则在同一遍历中合并，保留被其它覆盖隔开的重复声明；先复现 uni-app x 的相邻组件规则重复，再修复并保持原 static 基线通过。
- 命名层即使清空也必须保留首次声明位置，匿名层具有独立身份，不能跨输入合并。组合选择器的每一项都参与覆盖区间，避免 `.a,.b` 与 `.a` 被分别去重后颠倒顺序。两项新增用例均已先复现错误，再修复并通过。
- Taro React v4 基线变化包括去除两条重复字体定义、动画块位置调整和保留四组声明顺序不同的 vendor 规则。按条件、选择器、属性、优先级和声明值比较，更新前后均为 6388 个唯一声明，无缺失、无最终值变化；NutUI 关键覆盖的真实构建断言通过。

### 本轮验证（接续 5c1ddd676）

- `CI=1 pnpm test --update=none`：541 文件、5292 测试通过；5 文件、47 测试既有跳过。
- 清理器及组合单测包含 legacy/graph 各 8000 条填充规则；最终组合集合 14 项通过。WXSS 独立配置 34 项通过。
- 核心包构建及新增/修改源文件、组合测试 ESLint 通过。
- `pnpm typecheck` 仍有 445 条诊断，本轮修改文件无诊断；不将包构建通过等同于严格类型检查通过。
- `CI=1 pnpm test:release`：222 项通过、4 项既有跳过。
- issue-977/978：8 项通过；Taro coverage contract 7 项、模板 contract 9 项、canonical smoke 4 项通过。
- generator 的基线更新限定 Taro Vite React/Vue v4 与 uni-app Vite v4；汇总 JSON/中英文报告只同步这三个项目构建产生的字节数，选择器列表和其它项目未变。
- 最终实现的 Taro React/Vue、uni-app、uni-app x 与层顺序 E2E：5 文件、14 项通过；uni-app x 使用本机 HBuilderX Alpha 5.25.2026082902-alpha CLI 构建，没有将其视为设备验收。
- static 三个分片和完整 generator 集合已在最终 core banner 修复及工作区依赖覆盖后重新验证通过；weapp-vite 独立 banner 基线另行更新并复核。

### 验证

- 本轮完整单测、发布集合和冻结安装均通过；apps-generator 已单独更新并以禁止更新模式复核。
- 静态分片、真实框架构建和环境型类型诊断分别记录在交付说明中；快照只在确认产物语义后更新。

### 规模验证

本地预热两轮后取七轮中位数，4000/8000/16000 条规则分别约 21/38/75 ms；输入约 163/327/661 KB。此前逐条删除的大数组移动开销已经消除。该测量用于确认规模趋势，不替代框架构建与 HMR 的 CI 性能门禁。

```sh
rtk proxy pnpm exec tsx --eval 'import { performance } from "node:perf_hooks"; import { composeFrameworkProcessedCss as compose } from "./packages/weapp-tailwindcss/src/bundlers/shared/framework-css-composition.ts"; for (const size of [4000,8000,16000]) { const source=Array.from({length:size},(_,i)=>`.vendor-${i}{color:rgb(1,2,3);height:1px}`).join(""); const generated=source+".utility{display:flex}"; const times=[]; for(let i=0;i<9;i++){const start=performance.now();compose("",generated,source);if(i>1)times.push(performance.now()-start)} times.sort((a,b)=>a-b); console.log({rules:size,bytes:generated.length,medianMs:times[3]}) }'
```

## 适用边界

### Mpx 多平台及空生成输入复核

- PR run `34790213574` 的 Mpx 各平台基线仍记录原始 `.25rem` 和转换后的 `8rpx`。在 `rem2rpx: true` 配置下，旧根规则被恢复后会覆盖已转换的值；当前四个平台产物仅保留 `8rpx`，用户 `--test-color` 和 `--color-test` 保留。
- 钉钉还有独立问题：默认 matcher 不包含 `.ddml` / `.ddss`，使模板类名与样式适配跳过。补齐默认 matcher，并覆盖 POSIX、Windows 盘符、相对路径及非产物后缀。修复后真实 `.ddss` 保留 `8rpx` 和用户变量，模板类名与任意值样式消费验证通过。
- 新增空输入回归发现：生成 CSS 为空时直接连接两侧框架 CSS 会保留重复 `@charset`。撤回这一条短路；两侧框架输入为空时仍直接返回生成产物，保留性能优化。
- 两项缺陷先由新增单测复现，共 5 个失败；修复后 defaults、composition unit 和 legacy/graph 组合测试共 24 项通过。
- 基线更新命令：`CI=1 pnpm e2e:demo:matrix mpx-tailwindcss-v4:wx mpx-tailwindcss-v4:ali mpx-tailwindcss-v4:swan mpx-tailwindcss-v4:tt mpx-tailwindcss-v4:dd --update --build-only`；钉钉 matcher 修复后单独重建该目标。审查后五个基线只删除未转换的 rem 值。
- 禁止更新复验：`CI=1 pnpm e2e:demo:matrix mpx-tailwindcss-v4:wx mpx-tailwindcss-v4:ali mpx-tailwindcss-v4:swan mpx-tailwindcss-v4:tt mpx-tailwindcss-v4:dd`，五个平台全部通过生产构建、初始、替换、新增及恢复四轮 HMR；不将其视为真机证据。
- 修改后的完整 `CI=1 pnpm test --update=none`：542 文件、5302 测试通过，5 文件、47 测试既有跳过；`CI=1 pnpm test:release`：222 测试通过、4 测试既有跳过。核心包构建、修改文件 ESLint、`pnpm agents:check`、`git diff --check` 通过；`pnpm release status` 仍只有核心包中文 patch intent，联动范围由已有发布策略决定。
- `CI=1 E2E_PROJECT_FILTER='^mpx-tailwindcss-v4$' pnpm e2e:static --update=none`：64 文件、342 测试通过，15 文件、44 测试跳过。该入口仍执行共享 smoke/contract，包括 Taro H5、uni-app 层顺序和 runtime 变量；Mpx static 两项通过，无基线自动更新。

### 发布与设备边界

- 本地验证覆盖编译与产物；没有把 CLI 构建记为 IDE、设备或真机验收。
- 中文 patch intent 只指定 `weapp-tailwindcss`。清理器及组合逻辑属于核心包，`@weapp-tailwindcss/postcss` 的源码和公共行为未改动，不单独增加其版本。
- `pnpm release status` 显示核心包 5.5.5 → 5.5.6，CLI 与依赖消费包的联动来自仓库已有 fixed/dependency 策略。
- 只交付补丁和恢复测试，本次没有运行 npm publish、推送发布 tag 或实际补建 Release。
- 上游增强：[repoctl #887](https://github.com/sonofmagic/repoctl/issues/887)、[repoctl #888](https://github.com/sonofmagic/repoctl/issues/888)，关联 #848，不重复提出 provenance 问题。

## AI 协作中的教训

- **交付集合核对太晚。** 用户再次要求测试文件和 changeset，说明此前把“实现已提交”过早当成完整交付。以后提交前对照实际 diff 核对源码、反例测试、基线和中文 intent；验证结果必须说明测试的是哪个提交。
- **修测试预期前先判断产物语义。** `.small` 误报应修 AST 检测边界；用户变量丢失与 NutUI 覆盖错序则是真实产物缺陷。不能把两类失败都归为快照过期。用声明来源、条件上下文、值、优先级和顺序判断，而非字符串子串、变量前缀或唯一声明数量。
- **性能短路必须证明等价。** 按 250 KB 大小跳过恢复、生成输入为空时直接拼接都曾隐藏语义问题。可保留的优化是无框架输入时省去无意义解析，以及批量重建、共享索引、减少签名分配；空输入和大输入都应有行为回归。
- **单次 RSS 波动不等于根因。** Taro Vite React 的一次样本比基线高 5.13%，阈值为 5%；同一 head 的失败分片复测与总门禁通过。这只能证明本次复测通过，不能声称噪声根因已证实或性能已达到最优。首次失败记录应与重试一起保留。
- **等待开销和沟通需要收敛。** 本次多次等待 180–300 秒并重复报告排队数字，降低了可响应性；还曾把“未完成（包含运行中）”写成“排队”。以后单次等待不超过 60 秒，分开统计 queued/in_progress/completed，减少无行动价值的报数，优先汇报状态变化。GitHub 队列时间不能混入构建性能结论。
- **取消与重试也有依赖。** 取消旧工作流曾联动取消 benchmark；以后先查 concurrency 和调用关系，再选择失败分片重试。远端新增 runtime 提交后，最终验证归属新 head，不能把本地旧 SHA 的全量测试包装成新 SHA 的本地验证。
- **补丁必须有上游出口。** 本次本地 pnpm patch 是临时验证手段，不能替代 repoctl 修复。上游 Issue/PR、精确版本与移除条件应同时记录，用户无需再次追问才知道后续维护方式。

## 最终 CI 核对与后续状态

下列是 PR #1197 的历史验收证据，2026-09-14 沉淀时重新查询 GitHub 确认；不代表之后 main 上的新改动已通过同一验证。

- 验证 head：`0d5c3dc2be8827ed08eeec708d9f7d82705c7de9`；[PR Gate 34799393321](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34799393321) 为 completed/success，179 个 job 成功。
- PR 检查汇总为 196 个成功、12 个条件跳过、0 个失败、0 个未完成；包含性能门禁与 Release Gate。PR 已合并，merge commit 为 `d3a577850802bb3e0d5c32fbc9c66fae0d1485ba`。
- 本地最终全量 5302 passed/47 skipped 对应本任务源码提交 `0ade9c5b728df8bb8aada10c1c3f354c4976c378`；远端后来整合 runtime 提交，使用上面的当前 head CI 作远端证据。此前严格类型检查 445 条诊断的限制仍保留，本记录维持 `partial`，不改写为所有验收维度全绿。
- 性能首次失败与复测见 [Benchmark 34799392935](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34799392935)。微基准的规模趋势和真实 CI 门禁承担不同证据范围。
- 上游补充 [repoctl #893](https://github.com/sonofmagic/repoctl/issues/893)，[repoctl PR #894](https://github.com/sonofmagic/repoctl/pull/894) 已合并，修复响应体读取中断绕过重试的问题。#887/#888 保留各自的重试、对账需求范围，不能把 #894 合并等同于所有恢复能力交付。
- 沉淀基线 main `ef28394f1` 的 manifest 已使用 `repoctl: ^5.5.3`，旧 `@icebreakers/monorepo@5.5.0` patch 及其 workspace 登记已移除。此前“以后删除 patch”的答复已滞后；后续回答应先核对当前 manifest 和补丁登记。这里仅确认仓库状态，不推断该版本已覆盖所有上游增强需求。

## 规则评估

初次修复未新增 AGENTS 规则，现有生成来源、构建图、回归与基线约束已足够。完成 CI 跟进后，将可复用的性能证明、当前 head 验收、有限重试、等待沟通、交付集合和上游补丁退出要求补到 [工程流程](../agent-workflow.md)。根规则已有该入口，不重复扩充根 AGENTS，也不为纯文档新增包 changeset。未来变更 CI 调度或发布工具时重新检查这些步骤的适用性。
