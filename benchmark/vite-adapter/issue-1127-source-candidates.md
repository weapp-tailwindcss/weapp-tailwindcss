# Issue #1127 合成基准

使用 `issue-1127-source-candidates.mjs` 可生成 4 个 source root、每个 30 个 Vue SFC 的 120 文件候选扫描夹具：

```bash
pnpm exec node benchmark/vite-adapter/issue-1127-source-candidates.mjs 4 30
```

脚本只生成临时源码并输出 JSON，不写入仓库。生成的 roots 可作为 Tailwind v4 `@source` 或项目 source 配置输入；页面/组件 bundle 规模使用现有 Vite adapter 的 `--inject-pages 150`，单文件和多文件 HMR 使用现有 `--project-file` 与 benchmark 运行器。

建议记录 optimized/legacy 两组的 cold build、warm incremental、单文件 HMR、多文件 HMR median/P95，并沿用仓库已有 5% regression guard。
