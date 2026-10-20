# 小程序构建证据

<!-- agents:cwd=root -->

## 适用范围

本目录负责统一 Tailwind 验收中的登记小程序平台构建与样式证据。

## 核心职责

复用现有产物断言，逐案例归档本轮 bundle，并生成 v2 报告。

## 变更原则

- 登记占位条目必须保留未执行，不运行空命令冒充构建。
- 每个案例完成后立即保存原始产物，不能引用后续构建会覆盖的目录。
- 构建和样式证据只贡献 encoding 层级，不能代替 IDE 或设备运行。
- 专用 Vitest 配置仅收集本目录的执行文件，不能拼接父配置的全仓 include。

## 测试要求

覆盖占位条目、缺样式、构建断言失败、后续产物覆盖和配置收集范围。

## 推荐验证命令

- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-build-matrix.test.ts --update=none`
- 实际矩阵由 `pnpm e2e:tailwind --target mini-builds --preflight-report <本轮报告>` 调度。

## 提交前检查

检查报告中的逐项目状态和原始产物 hash；不得将未执行登记项计为通过。
