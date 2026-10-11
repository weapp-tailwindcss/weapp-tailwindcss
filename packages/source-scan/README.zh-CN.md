# @weapp-tailwindcss/source-scan

> [English](./README.md) | 简体中文

共享来源扫描基础设施：路径身份、glob 规范化、正负规则匹配、来源分组与扫描策略。

本包不解析 CSS，不枚举文件，不提取候选，不依赖 Tailwind、PostCSS 或构建器。文件枚举由调用方注入；engine 使用 Oxide，PostCSS 将 CSS AST 来源指令转换为扫描描述。

```ts
import { createSourceScanPlan, isFileMatchedByTailwindSourceEntries } from '@weapp-tailwindcss/source-scan'

const entries = createSourceScanPlan({
  base: projectRoot,
  mode: 'explicit',
  entries: [{ base: projectRoot, pattern: '**/*.qxml', negated: false }],
})
const included = isFileMatchedByTailwindSourceEntries(file, entries)
```

`auto` 添加默认来源，`fallback` 仅在没有正向来源时补充默认根；`explicit` 只使用给定来源，`disabled` 禁用自动扫描但保留显式来源。`ignoredPatterns` 为每个来源根应用相同排除规则。匹配辅助函数默认把纯排除列表视为过滤器；`requirePositive: true` 则要求正来源，供 engine 的历史匹配入口使用。文件枚举始终要求正来源，纯排除规则不会启动全项目扫描。

路径身份通过现存父目录解析符号链接，因此文件删除、重建前后保持一致。文件系统路径使用对应平台的 path API；仅 glob 与匹配边界使用正斜杠。默认模板扩展名包含 `.qxml`。

支持 ESM、CJS 和 TypeScript。验证入口为 `pnpm --filter @weapp-tailwindcss/source-scan test`。
