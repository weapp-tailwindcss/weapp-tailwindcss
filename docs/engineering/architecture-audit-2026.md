# weapp-tailwindcss 架构与工程增强审计

> 2026-09-20 更新：基于 `5e96fdc16` 实施职责收敛，新增 source-scan、PostCSS 分层子路径、project-sources 和自动依赖图检查。当前所有权与兼容策略见[架构职责与依赖契约](architecture-responsibility.md)。以下保留 2026-09-11 的审计背景，不能代替本轮验证记录。

> 审计基线：`c41a9076d`（main，2026-09-11）。本文是基于源码、测试、benchmark、规则和 skill 的静态审计；没有把未运行的跨平台设备链路当作已验证事实。

## 1. 当前架构

核心入口位于 `packages/weapp-tailwindcss`。`createContext` 管理 Tailwind runtime、classNameSet 和模板/脚本/样式转换；`createCompiler` 把快照、源码候选、CSS 生成和增量更新抽象成编译器层。`@weapp-tailwindcss/postcss` 负责 AST 处理、兼容性和结果缓存，Vite、Webpack、Rspack、Gulp 通过各自 adapter 接入。运行时能力拆分到 `packages-runtime/*`，模板与框架验证集中在 `e2e/` 和 `demo/`。

主要优点：单一 Tailwind 生成链路、明确的 classNameSet 精确命中约束、较完整的 v3/v4 与多平台兼容分支、已有缓存/HMR/内存 benchmark，以及以复盘文档和 `pnpm agents:check` 约束 AI 协作。

主要结构风险：adapter 对编译器内部状态的依赖仍较多；扫描、候选集合、CSS 生成和产物注入的生命周期边界分散在多个包；诊断事件缺少统一 schema；性能数据已有采集脚本但缺少稳定的历史查询面；AI skill 有规则和触发样例，但缺少端到端质量指标。

## 2. 性能与可靠性发现

### 已证实

- PostCSS handler 已使用选项指纹、feature probe、内容哈希和 LRU 结果缓存。
- benchmark 已覆盖版本对比、框架矩阵、构建/HMR 时间和内存，并有 `perf:guard`。
- HMR 与多平台 E2E 已有大量回归用例和失败证据目录。

### 推断风险

- 缓存键和失效原因对使用者不可见，难以区分“扫描变化”“配置变化”和“生成器变化”导致的重算。
- 当前门禁更偏整体结果；缺少 source scan、AST、Tailwind generate、注入四个阶段的 P95/P99 分解。
- 长时间 watch 的内存生命周期、LRU 淘汰和跨项目复用缺少统一趋势报告。

## 3. AI 流程发现

已有 `skills/*`、触发评测集、规则索引、工程工作流和 lessons 复盘，强调先复现、找首次偏离、分层验收。这是可靠基础。

待增强部分：Issue 信息尚未自动结构化为“事实/假设/证据”；AI 生成的回归建议没有统一评测；skill 触发准确率、误导率和完成率没有持续指标；Issue、fixture、测试、E2E 基线与 release note 之间缺少机器可追踪关系。

## 4. 优先级与依赖

建议季度顺序：

1. P0：统一诊断事件模型、分层性能指标与 HMR 门禁。
2. P1：编译器/adapter 契约、缓存可观测性、支持矩阵自动化。
3. P1：Issue 到回归证据追踪、模板/文档/skill 影响检查。
4. P2：AI triage/eval、运行时按需加载与体积治理、兼容性弃用周期。

依赖关系：诊断事件模型是性能报告和 AI triage 的基础；追踪关系依赖统一事件与支持矩阵；运行时体积治理可独立推进。

## 5. 限制

本审计未执行完整 `pnpm test`、跨平台 IDE/设备 E2E 或远端 CI；因此没有给出绝对性能数值，也没有宣称 Windows、macOS、Linux、Harmony 和 HBuilderX 的当前行为完全一致。实施每个 Issue 时应按就近规则补定向测试，并记录真实环境证据。
