# Rust 选择器类名计算实验

此内核只迁移已解码类名的转义计算。选择器解析、PostCSS AST、复杂伪类展开、平台兼容处理、单位和颜色处理、用户插件仍由现有管线执行，不能将其称为完整 CSS 管线迁移。

`escapeClasses` 接收一批 UTF-16 类名与可选 ASCII 映射，保留默认映射、开头数字、非 BMP 字符和孤立代理项语义。选择器处理器在遍历 AST 前批量计算映射，类名节点和伪类展开副本复用该映射。

运行 `pnpm --filter @weapp-tailwindcss/postcss build:native` 构建当前平台的本地二进制。加载器先查找本包 `native/weapp-tailwindcss-postcss.node`，再加载对应平台包。平台分发仍需要发布流水线提供。

`WEAPP_TW_NATIVE` 支持：

- `auto`：默认尝试加载；模块缺失或 ABI 不兼容时回退 TypeScript。
- `off`：完全使用 TypeScript。
- `required`：缺失二进制或 ABI 不兼容时抛出明确错误。

原生转换异常不会被加载器吞掉。新增的 `native-selectors.test.ts` 强制实际加载原生内核，执行该测试前必须构建二进制。

验证入口：

```sh
pnpm --filter @weapp-tailwindcss/postcss build:native
pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/native-selectors.test.ts test/native-selectors-loader.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/postcss exec tsx native/benchmark.mts
```

benchmark 在同一进程内交替测量 1、8、64 个类名的批处理与无缓存选择器 root，先断言输出一致，再记录输入 SHA-256、环境、35 次样本及 median/p95。此结果不代表完整 CSS 处理、冷构建或 HMR 收益；新增的 AST 遍历、映射及 NAPI 开销必须一并评估。

2026-10-04 的本机实验（Node 24.18.0、macOS arm64、Apple M4 Max）表明这个边界太小：1、8、64 个类名的原生批处理分别比 TypeScript 慢约 2.06、1.51、1.40 倍；包含解析和映射的选择器 root 分别慢约 13%、11%、15%。因此本分支只保留可复现实验，当前结果不支持在正式版本默认启用此实现。后续若继续迁移，须验证更大粒度的选择器计算是否能抵消边界开销。
