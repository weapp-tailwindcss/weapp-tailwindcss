# tailwindcss4 性能对比

对比 upstream 生态与小程序增强版在 tailwindcss v4 体系下的运行时开销。基准测试通过 Vitest 5 的测试上下文 bench API 运行（配置见 `vitest.config.mts`），可以在 `bench.bench.ts` 调整样本数据和测量项目。包内 `bench` 脚本会启用顶层 JSON reporter，并在当前目录输出 `bench-report.json`。

## 运行

```bash
pnpm --filter benchmark-tailwindcss4 install
pnpm --filter benchmark-tailwindcss4 bench
```

需要的依赖：

- `tailwind-merge` / `class-variance-authority` / `tailwind-variants`（最新版）
- Workspace 内的 `@weapp-tailwindcss/merge`、`@weapp-tailwindcss/cva`、`@weapp-tailwindcss/variants`
