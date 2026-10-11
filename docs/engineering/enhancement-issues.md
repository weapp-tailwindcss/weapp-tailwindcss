# 架构与工程增强 Issue 草案

以下草案默认使用普通 Issue 关联方式，不使用 `Fixes`/`Closes`。

## P0：统一编译诊断事件与报告

**问题**：扫描、生成、转换、注入和 HMR 的日志格式分散，失败时难以定位首次偏离。

**目标**：定义版本化 `CompilationEvent` schema，覆盖 project、compiler、adapter、phase、duration、cache、module/source identity、error 和 evidence 引用；提供 JSONL 与人类可读报告。

**验收**：Vite、Webpack、PostCSS 至少各产出一份事件；事件可关联一次 HMR；敏感路径可脱敏；旧日志行为兼容。

**测试/依赖**：事件 schema 单测、adapter 集成测试；作为性能和 AI Issue 的前置依赖。

## P0：增加分阶段性能基准与 HMR P95/P99 门禁

**问题**：已有整体 benchmark，缺少扫描、生成、AST、注入和 HMR 各阶段指标。

**目标**：输出阶段耗时、缓存命中率、峰值 RSS、增量文件规模，并按框架/平台保存历史基线。

**验收**：CI 能比较基线并报告回归；P95/P99 和内存阈值可配置；冷启动与稳态 watch 分开统计。

**测试/依赖**：复用现有 `benchmark/version-compare`；依赖诊断事件模型。

## P1：统一编译器与 bundler adapter 能力契约

**问题**：adapter 共享内部状态的方式不一致，新增平台容易复制生命周期逻辑。

**目标**：定义 compiler host、source candidate、asset emission、watch update、diagnostic capability 接口；adapter 只实现能力声明和桥接。

**验收**：Vite/Webpack/Rspack/Gulp 通过同一契约测试；缺少能力时给出明确诊断；不新增硬编码目录或后置读文件。

## P1：建立分层缓存可观测性与失效策略

**问题**：缓存命中/淘汰/失效原因不可见，复杂项目难以调优。

**目标**：拆分 source scan、candidate set、Tailwind CSS、PostCSS result 缓存，统一 key fingerprint 和统计接口。

**验收**：报告命中率、淘汰数、失效原因和内存占用；配置变化不会复用错误结果；跨平台路径身份有回归用例。

## P1：自动生成跨框架与多平台支持矩阵

**问题**：支持矩阵、demo、E2E 与文档存在手工同步成本。

**目标**：从 manifest、demo 配置和 E2E 元数据生成矩阵，标注 verified/partial/blocked 与失败归因。

**验收**：新增或移除框架会触发差异检查；矩阵链接到测试和报告；不把跳过误报为通过。

## P1：建立 Issue 到回归证据的追踪链

**问题**：Issue、fixture、单测、E2E 快照和 release note 之间缺少统一 ID。

**目标**：定义轻量 frontmatter/metadata 约定，自动检查 Issue URL、回归路径、基线和发布说明的一致性。

**验收**：缺少回归入口或断链时 CI 失败；支持 partial/superseded；不改变现有关闭型关键词政策。

## P1：模板、demo、文档与公开 skill 影响检查

**问题**：源码能力变化可能漏同步模板、网站和 skill 元数据。

**目标**：根据变更路径生成影响清单，并提供只读检查和明确豁免说明。

**验收**：核心 API、配置、平台支持变化能提示对应同步项；纯文档变更不触发无关构建。

## P2：AI Issue triage 与根因假设助手

**问题**：AI 可以读取规则，但 Issue 信息整理和证据缺口识别仍依赖人工。

**目标**：生成事实/假设/待验证项、最小复现建议、首次偏离探针和回归测试候选；禁止自动修改源码或创建后台任务。

**验收**：在脱敏 fixture 上输出结构化结果；每条假设带证据或明确标记未验证；与现有 workflow/lessons 格式兼容。

## P2：Skill 与 eval 的版本化质量指标

**问题**：已有触发样例，但没有持续衡量触发准确率和误导率。

**目标**：建立按 skill、场景、版本统计的 precision/recall、误导建议率、用户修正率和完成率。

**验收**：`pnpm skills:validate` 检查数据格式；变更 skill 时生成差异报告；失败样例可回放。

## P2：运行时按需加载与体积预算

**问题**：runtime、merge、variants 等包虽有子入口，但缺少统一体积预算和 tree-shaking 验证。

**目标**：为主入口和子入口建立压缩体积、依赖图和重复代码报告。

**验收**：CI 对关键入口设预算；导入子入口不会带入无关模块；跨 ESM/CJS 构建验证通过。

## P2：兼容性策略与弃用周期

**问题**：Tailwind v3/v4、多平台和框架兼容分支持续增长，用户难以判断支持边界。

**目标**：维护 capability matrix、弃用周期、迁移说明和 breaking-change 模板。

**验收**：每个兼容分支有 owner、测试入口和移除条件；发布前检查文档与矩阵一致。

