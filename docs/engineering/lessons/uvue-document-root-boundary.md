---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f9f0cd0aad68f3e0774790d15b87fc443c7ef4e8
regressions:
  - packages/postcss/test/uni-app-x-document.test.ts
  - packages/postcss/test/uni-app-x.test.ts
  - packages/postcss/test/uni-app-x-runtime-variables.test.ts
  - packages/postcss/test/uni-app-x-author-apply.test.ts
  - packages/postcss/test/uni-app-x-border.test.ts
  - packages/postcss/test/uni-app-x-style-value.test.ts
---

# UVUE 多文档样式的 Root 边界

## 症状

原 scripts 严格类型检查发现 UVUE 后处理把 PostCSS `Result<Root | Document>` 交给单 Root 算法。真实 Document 回归同时复现三个运行时问题：同名主题变量跨 Root 覆盖、未在 Document 子 Root 内执行 calc 导致有效声明被当作不支持语法删除，以及一份样式的 SFC 来源放行兄弟的全局选择器。

## 根因与纠正

Document 表达多个有独立输入和作用域的样式 Root，不能对整个 Document 共用主题收集或作者来源判断。后处理保留原容器，按子 Root 顺序完整执行主题消费、值归一化、calc、空声明清理、SFC 或普通选择器策略和 at-rule 清理。主题 helper 原本就复制配置 Map，现在每个 Root 单独调用，仍保留显式值覆盖兼容值、本地主题覆盖配置的原优先级。SFC 判断接收当前 Root 的真实视图，不提前序列化或克隆。Document 的聚合 `opts.from` 不代表各 Root 的作者来源，因此只在这一判定视图中排除；实际 Result、calc 和最终序列化继续使用原选项。单 Root 仍保留原有 `opts.from` 优先契约。

内部 calc 插件只遍历并修改原树，不替换根；后处理继续保留该 Root 引用，不把 calc Result 的联合根强转成 Root。最终仅对原容器调用一次 `toResult`，保留 Document 和子 Root 身份、parent 关系及各 Input。原消息复制一次，新增过滤警告按 Root 顺序进入结果，calc 消息按原后置顺序追加；整 Result 的警告去重策略不变。各 Root 的 banner 证据只用于自身，不传播到兄弟作者样式。作者来源证据还包括所属 Root 自身的 Input，避免插件新建无 source 子节点时丢失仍然有效的根来源。

## 验证

- 首次新测试因直接导入未声明的间接 source-map 包而未启动，保留该日志；改用公开 `postcss.Input.origin` 检查真实映射，没有增加测试依赖。
- 生产改动前五个真实测试为三失败、两对照通过，原失败日志保留。随后补充独立 banner、聚合来源、Root 自身来源和 calc 警告控制，共九个新测试。独立复核发现共享 `opts.from` 仍会放行兄弟来源，新增测试先一失败、七通过，再修复判定视图；Root 自身来源控制再一失败、八通过，补回本 Root 的证据。不能只覆盖没有聚合来源或子节点都有 source 的 Document。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/uni-app-x-document.test.ts test/uni-app-x.test.ts test/uni-app-x-runtime-variables.test.ts test/uni-app-x-author-apply.test.ts test/uni-app-x-border.test.ts test/uni-app-x-style-value.test.ts --update=none --coverage.enabled=false`：最终六文件103项通过，没有更新快照。
- 回归断言两个独立主题分别求值为6px和15px，缺失主题使用配置值而不借兄弟值；检查原 Document、两个 Root、规则及 Input 身份，以及真实生成 map 的两个来源和输出位置的反向映射。
- 非 UVUE 仍直接返回原结果；空 Document、SFC 与普通样式混合、banner 隔离、原 dependency 消息与被删节点警告顺序均覆盖。两个 Root 的真实除零 calc 警告验证原 dependency 前缀、按 Root 顺序的过滤警告、后置 calc 警告及其原 declaration 身份。
- 三个 TypeScript 文件显式 lint、包构建和声明生成通过。原严格入口 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false` 从11降至8条，整体仍失败；既有包内 noCheck 不能代替严格验收。

## 适用边界

本次只修复 UVUE 后处理的多 Root 边界。handler 的 custom parser、占位还原与缓存身份，以及作者插件和平台阶段的完成边界仍需独立完成；不把定向通过写成全面、原生多目标或正式性能验收。

## 规则评估

不新增 AGENTS 条目。现有 AST 所有权与回归要求足够：遇到 Root 和 Document 联合时先识别作用域和来源归属，不能用强转消除差异，也不能通过拼接 CSS 再 parse 丢失多输入来源。
