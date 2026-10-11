# `benchmark/runtime-cn-vs-merge`

## 适用范围

- 本目录对比 `@weapp-tailwindcss/cn` 与 `@weapp-tailwindcss/merge` 的语义、体积和运行时性能。
- 不改 `packages-runtime/cn`、`packages-runtime/merge` 的行为。

## 核心职责

- 对拍 weapp `cn` / `merge` / slim / lite 与上游 `cn` / `tailwind-merge` 的输出。
- 测量吞吐、延迟、冷启动、缓存命中与打包体积，并生成独立中文报告。

## 变更原则

- 性能数字必须来自本目录脚本的本地实测，禁止手填或引用上游宣传值。
- 路径使用 `node:path` / `fileURLToPath`，临时目录使用 `os.tmpdir()`。
- 受试者隔离在独立 Node 子进程中测量。

## 测试要求

- 改 cases / subjects / 报告生成逻辑后，重新跑 `parity`、`bundle`、`bench` 并核对报告表格与 `data/*.json` 一致。

## 推荐验证命令

- `pnpm --filter benchmark-runtime-cn-vs-merge all`

## 提交前检查

- `data/*.json` 与两份报告表格数字一致。
- `performance-report.md` 与 `upstream-cn-vs-tailwind-merge.md` 都可独立阅读。

