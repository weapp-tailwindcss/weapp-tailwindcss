---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1238
baseline: 6b4d932bd978411e25cc0ebbbd5df1230cccd290
regressions:
  - packages/postcss/test/mp.test.ts
  - benchmark/performance/test/scenarios.test.mjs
  - benchmark/performance/test/gate.test.mjs
---

# Issue #1238：Tailwind v4 主样式重复扫描复盘

## 症状

Tailwind CSS v4 主样式进入 PostCSS `pre` 阶段后，每条可能清理空 `--tw-content` 初始化的规则都会查询整个 CSS Root。规则数量增加时，单条规则的局部处理被放大成全量 AST 遍历，导致总耗时呈超线性增长；缓存命中场景也会被同一类扫描污染。

## 根因与纠正

`commonChunkPreflight` 同时承担规则级变换和 Root 级内容变量判断。此前调用方把判断结果作为普通布尔值传入，但在主样式预处理过程中没有统一管理 Root 状态，直接调用路径又需要自行推导状态。结果是批量遍历时重复执行 `usesTailwindcssV4ContentVariable(root)`，而预处理期间注入的声明还可能让早期结果失效。

主样式的 `Once` 阶段为当前 Root 创建一次性的内容变量状态对象。首次读取时执行扫描，后续规则复用结果；任何会改变 Root 的预处理注入都显式失效状态，下一次读取时重新计算。状态不跨 Root、不写入全局缓存，也不使用跨请求的 `WeakMap`，因此不会读到修改后的旧结果，并且并发处理相互隔离。

直接调用 `commonChunkPreflight` 的内部测试和兼容代码仍保留惰性回退，但只有根级作用域或需要清理初始化的规则才触发回退扫描。普通 class 规则、Tailwind v3 和非主样式链路不会执行无意义的 Root 查询。

## 适用边界

- CSS 实际使用 `var(--tw-content)` 时保留默认初始化。
- 未使用时继续移除空初始化。
- `:root`、`:host`、小程序默认根选择器、伪元素和 `::backdrop` 的变量作用域行为保持不变。
- 内容变量注入或其他预处理回调修改 Root 后，后续规则按最新 Root 内容判断。

## 验证

PostCSS 性能场景使用 1k、2k、5k、10k 规则重复采样，冷处理复杂度指数降至线性范围，缓存命中单独统计；重复采样输出哈希稳定。单元测试覆盖普通 class 不扫描 Root、直接调用惰性回退、已使用与未使用 `--tw-content`，以及注入后的状态失效。

## 规则评估

本次修复继续把 Root 级状态限制在单次 `Once` 生命周期内，未引入全局状态、跨 Root 缓存或文件系统旁路。Root 查询仍由 PostCSS AST 工具负责，主包和 bundler 生命周期没有新增职责；性能场景和输出哈希回归由 benchmark 门禁持续检查。
