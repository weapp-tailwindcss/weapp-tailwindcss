# Node.js API compiler 示例

这个示例覆盖 `import { createCompiler } from 'weapp-tailwindcss/core'` 的直接 Node.js 用法。

## 运行

```bash
pnpm --filter @weapp-tailwindcss-example/node-api-core build
pnpm --filter @weapp-tailwindcss-example/node-api-core memory
pnpm --filter @weapp-tailwindcss-example/node-api-core test
```

## 覆盖点

- `generate()` 通过现有 source resolver 生成 Web CSS，并返回 revision 与不可变 snapshot。
- `transformCss()`、`transformTemplate()` 和 `transformJavaScript()` 显式消费同一 snapshot。
- 模板和 JavaScript 只转换 snapshot 精确命中的 class。
- 连续增删 candidates 时复用同一 root 的 Tailwind engine 与 Scanner。
- `remove()`、`dispose()` 后释放 root 状态，并验证长生命周期 heap 增长保持稳定。
