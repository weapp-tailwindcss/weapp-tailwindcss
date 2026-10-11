# Package Guidelines (`packages/tailwindcss-injector`)

## 适用范围
- 本文件适用于 `packages/tailwindcss-injector`。
- 该包提供 Tailwind 指令注入与 WXML 依赖追踪，属于构建链路敏感模块。

## 目录与职责
- `src/postcss.ts`：PostCSS 插件主流程（指令插入、Tailwind 配置解析、content 注入）。
- `src/wxml.ts`：WXML `import/include` 依赖解析与缓存（`hashMap`、`depsMap`）。
- `src/config.ts`：默认配置与用户配置合并。
- `src/utils.ts`：复用 `@weapp-tailwindcss/shared` 工具，保持轻量桥接。

## 变更原则
- 调整注入顺序时，必须同时考虑 `insertAfterAtRulesNames` 与 `insertAfterComments` 锚点策略。
- 修改缓存逻辑（`configCache`/`hashMap`/`depsMap`）时，必须补对应回归测试，防止增量构建失效。
- 处理 `content` 字段时保持幂等：避免重复注入、避免覆盖用户对象结构中的非 `files` 字段。
- WXML 依赖追踪仅处理明确支持的标签属性，不通过启发式扫描扩大范围。

## 推荐验证命令
- `pnpm --filter tailwindcss-injector test`
- `pnpm --filter tailwindcss-injector exec vitest run test/postcss.cache.test.ts`
- `pnpm --filter tailwindcss-injector exec vitest run test/wxml.test.ts`

## 提交前检查
- 涉及 `src/postcss.ts` 变更时，至少验证一条“指令插入位置”用例。
- 涉及 `src/wxml.ts` 变更时，至少验证一条“依赖递归与缓存命中”用例。
