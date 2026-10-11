# runtime cn vs merge

对比 `@weapp-tailwindcss/cn` 与 `@weapp-tailwindcss/merge` 的语义、打包体积和运行时性能。

```bash
pnpm --filter @weapp-tailwindcss/runtime --filter @weapp-tailwindcss/cn --filter @weapp-tailwindcss/merge build
pnpm --filter benchmark-runtime-cn-vs-merge all
```

- 全面对比：[`comparison-report.md`](./comparison-report.md)
- weapp 包装性能：[`performance-report.md`](./performance-report.md)
- 上游 `cn` vs `tailwind-merge`：[`upstream-cn-vs-tailwind-merge.md`](./upstream-cn-vs-tailwind-merge.md)
