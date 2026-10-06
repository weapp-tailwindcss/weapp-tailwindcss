---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 99e0f3b700a09d054758f72be3941c3b75722f37
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-mixed-class.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-dynamic-scope.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-iconify-evidence.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-class-evidence.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-removed-rules.unit.test.ts
---

# 混合模板 class 的消费证据与分支 scope

## 症状

移除 weapp-vite watch 的并发完整构建后，真实 classic 流程的 `content / issue33-arbitrary / add` 超时，报 `missing class/CSS evidence for bg-[#000] (bg-_b_h000_B)`。模板、脚本和样式此前均已完成多轮热更新与回滚。

## 根因与纠正

实际 class 属性包含静态 utility 和 `{{true?'h-[30px]':'h-[45px]'}}`。旧消费解析只接受纯静态属性或完整表达式，混合属性被整体忽略。相同 payload 的真实开发与生产 WXML 字节一致（SHA-256 `ecf46e8b17bdad67ff45d0f8b76b4c1fba2f4be9bbc47b6138811bc4bae5d76d`），CSS 也一致（`445571a345772c6c478a2e66d2e2f16301616c051b162dbcdc9829e63231556c`）。两者均有完整 `bg-_b_h000_B` 和 `.bg-_b_h000_B { background-color: #000; }`，但旧断言都失败，首次偏离在测试的消费解析层。

新解析器按实际空白或属性边界保留完整静态 token。未知动态表达式旁的词片段不能当成完整类名；表达式字符串、数组和三目值分支通过 TypeScript AST 读取。表达式语法无效时拒绝该属性，合法但不支持的表达式保持不可证明，其外部独立静态 token 仍可验证。插值闭合必须对应完整表达式，不能被字符串、注释、正则或对象括号内的 `}}` 提前截断，连续闭括号也允许重叠候选。

三目分支不能直接合并 scope。每个 literal token 或 render reference 只关联其实际出现的所有分支共同拥有的 scope，并在 `OutputTokenGroup.scopesByToken` 中保留证明方向。例如，同一 alias 在某一分支缺少 scope 时，不能从另一个分支或 scope 自身反向借用。原有局部循环绑定、WXS、命名模板、组件导出、render 和 data 关联约束继续生效。

Iconify 使用同一已解析消费者校验入口，先筛选带当前 marker 的单个消费分支，再使用原始 token 与定向 scope。不会跨分支拼出 marker 和样式证据，也不会通过合成 WXML 丢失来源信息；无关条件 alias 不影响目标 alias 已成立的 scope 证明。

## 验证

新增基础回归在修复前为 15 项失败、15 项通过。审查补充的连续闭括号和无关 Iconify alias 三项在修复前均失败。最终执行：

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-mixed-class.unit.test.ts test/watch-hmr-dynamic-scope.unit.test.ts test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-removed-rules.unit.test.ts test/watch-hmr-iconify-evidence.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none
```

六个文件共 290 项通过；原始 native 和 production 失败快照的六个 utility 重新经过严格 class/CSS 证据校验，全部通过，未删除输入或关闭 CSS 要求。

核心解析实现的真实 weapp-vite 7.4.0 classic `runCase` 功能整例通过：主模板、脚本、样式、content 新增/替换/删除、用户报告的三目颜色替换与回滚、main-style、普通及独立分包。保留构建，采样使用 `timeoutMs=120000`、`pollMs=40`，没有缩小该 case 的 mutation 矩阵。最后的连续闭括号与 Iconify 共享消费者修复发生在这次 native 运行结束后，由上述定向回归和保存产物复验覆盖；未宣称最终额外修改已重跑完整 CLI。

使用同一次保存的 metrics 调用官方 `assertHotUpdateBudget` 和 `assertPluginProcessBudget`，两项断言均返回通过；配置沿用现有 E2E 默认端到端 240000 ms、case 插件处理 1000 ms。端到端样本有实际记录，但本次 62 个插件计时数组全部为空，汇总的 0 不是实测 0 ms，不能据此宣称插件耗时达标。内存预算没有配置，未作内存门禁验收。未重复采样或修改阈值，插件计时缺证、其他性能与最终扩展流程仍由主任务处理。

`tools/weapp-tailwindcss-scripts` 完整严格类型检查存在 217 项诊断；以 TypeScript host 读取 HEAD 原文件对照当前文件，前后均为 217 项且新增、移除诊断均为空。完整类型入口仍应记为既有失败，不把局部无新增写成全仓类型通过。

忽略目录 `.tmp/weapp-vite-single-writer/` 保存 `content-diagnostic/` 的原文、恢复原文、开发/生产 WXML、JS、CSS 和原始失败，`content-parser-before.log`、`content-parser-review-before.log`、`content-parser-tests.log`、`parser-native-after.log` / `.json`、`parser-native-budget.json` 及类型对照。源码在真实流程 finally 后恢复，未修改 demo 或 static 基线。

## 适用边界

本轮调整仓库 E2E 的消费证明，不改变公开包样式生成行为。复杂调用、拼接和无法证明的表达式仍不提供动态 token；分支展开有界，不能通过合并互斥分支放行。真实微信 IDE 单写者复验见[对应复盘](weapp-vite-single-writer.md)，最终整仓验收不能用本轮单案例代替。

## 规则评估

不新增 AGENTS 规则。修复解析边界和共享证明入口，并保留正向、负向、跨分支隔离及回滚回归，已能持久表达此次教训。
