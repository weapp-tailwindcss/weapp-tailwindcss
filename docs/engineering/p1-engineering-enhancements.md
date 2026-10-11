# P1 工程增强实现说明

本阶段在 P0 诊断事件和性能报告基础上，完成构建器能力契约、分层缓存遥测、支持矩阵、Issue 证据和变更影响检查。

`compiler/capabilities` 定义构建器无关接口并提供 Vite、Webpack、Rspack、Gulp 的统一能力声明；`compiler/cache-telemetry` 覆盖 source scan、candidate index、Tailwind generation、PostCSS result 与 asset emission，记录命中、失效、淘汰、内存估算和 revision，并提供按层汇总。`scripts/generate-support-matrix.ts` 从 E2E、demo 和模板元数据生成支持矩阵，`scripts/p1-support-matrix.mjs`、`scripts/p1-evidence-check.mjs` 与 `scripts/p1-impact-check.mjs` 提供兼容的报告/校验入口。所有入口均为可重复的只读检查，不自动修改外部系统。

缓存遥测通过 `createCompiler({ compiler: { cacheTelemetry } })` 注入；旧调用方不提供该字段时保持原有行为。证据 metadata 支持 `verified`、`partial`、`superseded` 和 `not-reproducible`，路径校验使用跨平台 `node:path`。支持矩阵中的未覆盖、豁免和本地证据不会被标记为 CI verified。
