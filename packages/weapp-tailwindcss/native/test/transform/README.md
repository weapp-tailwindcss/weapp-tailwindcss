# Rust JS 完整转译验证

`createJsTransformer(classNames, escapeEntries)` 创建由 JS GC 管理的原生实例。`escapeEntries` 使用 `{ character, replacement }`，必须传入默认与自定义字典合并后的有效映射。该接口保留原始类名与已转义类名的精确命中，并保留业务斜杠路径、条件测试、directive 的过滤规则。

实例 `transform(source, lang, sourceType, preserveParens, options)` 返回完整代码或 `null`；`null` 明确要求兼容回退，执行异常不能被当作 `null`。支持的 `options` 字段为 `alwaysEscape`、`unescapeUnicode`、`moduleGraph`、`ignoreTaggedTemplates`。TypeScript 调用方继续负责公开选项、用户回调、source map、模块图/构建器生命周期及复杂 Babel parser 选项的门禁。

`replaceClassNames(classNames)` 原子更新类集合；失败返回 `false` 并保留旧集合，当前请求必须回退。不得仅凭 Set identity 或 size 判断是否需要更新；同大小的 delete/add 也必须触发同步。字典固定于实例创建时，字典变化需要重建实例。实例的解析事实缓存限制为 128 条、2 MiB，不持有 Oxc AST。

```sh
pnpm --filter weapp-tailwindcss exec node native/build.mjs
pnpm --filter weapp-tailwindcss exec tsx native/test/transform.ts
pnpm --filter weapp-tailwindcss exec tsx native/test/transform/benchmark.ts
```

设置 `WEAPP_TW_NATIVE_PATH` 可选择明确的构建产物。默认根据当前系统、架构和 Linux libc 选择本地 binding。

差分验证直接消费生产 `transformLiteralText`，覆盖默认/自定义字典、JS String.replace 的 `$` 替换语义、UTF-16、四种语法与显式括号、原子类集合更新，以及 2,000 组可复现随机 token。完整 Babel/插件回归由集成层单独执行。

基准固定 125,082 UTF-8 字节输入，SHA256 为 `21ad19ea581c664217f72ee2acebc73921de585c680e420c3de594deea09bcf3`。使用同一 Node/Oxc/输入做三轮、每轮 20 对交替采样，每次比较完整代码。冷路径包含 parse、walk 与替换；热路径复用分析事实。另行记录 6/1,000/10,000/100,000 项集合的原生构造/更新与 TS 内容校验开销。

这些数据只证明内核性能，不代表整个项目构建速度；转译计时不包含 TS adapter 的 Set/字典内容校验，不能忽略该开销后宣称完整调用链速度。
