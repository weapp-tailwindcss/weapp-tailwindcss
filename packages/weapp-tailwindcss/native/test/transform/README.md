# Rust JS 完整转译验证

`createJsTransformer(classNames, escapeEntries)` 创建由 JS GC 管理的原生实例。`escapeEntries` 使用 `{ character, replacement }`，必须传入默认与自定义字典合并后的有效映射。该接口保留原始类名与已转义类名的精确命中，并保留业务斜杠路径、条件测试、directive 的过滤规则。

实例 `transformWithCandidates(source, lang, sourceType, preserveParens, options, contains)` 是生产 adapter 的调用入口。它只把当前源码的候选字符串传给同步 `contains(candidate)`，先精确查询原值，未命中时再查询不同的转义值。成员决策仅在单次调用内缓存，集合原地变更在下次调用立即可见；`alwaysEscape` 不查询集合。返回完整代码或 `null`；`null` 明确要求兼容回退，执行异常不能被当作 `null`。支持的 `options` 字段为 `alwaysEscape`、`preserveStar`、`unescapeUnicode`、`moduleGraph`、`ignoreTaggedTemplates`。TypeScript 调用方继续负责公开选项、用户回调、source map、模块图/构建器生命周期及复杂 Babel parser 选项的门禁。

`analyzeJs` 的每个 literal 包含 `classContext`，与 Babel 的对象属性、JSX 属性和 class helper 祖先规则一致；对象方法、getter/setter 和 optional helper 不直接构成 class 上下文。四种语法的 template `start/end` 统一为正文 UTF-16 区间，string `start/end` 仍包含引号。完整转译使用 Oxc SemanticBuilder 检查 early error，并补齐 Oxc 默认略过的 TS 未定义导出检查，拒绝无效程序时返回 `null`。

生产 adapter 调用 `createJsTransformer([], escapeEntries)`，不枚举或同步整个 `classNameSet`，只接受 plain Set；自定义集合行为交还 Babel。旧的 `transform(source, lang, sourceType, preserveParens, options)` 与 `replaceClassNames(classNames)` 保留独立快照集合。更新失败返回 `false` 并保留旧集合。该旧集合不影响 `transformWithCandidates`。

字典固定于实例创建时，字典变化需要重建实例。实例的解析事实缓存限制为 128 条、2 MiB，不持有 Oxc AST 或 JS 回调。回调前释放所有缓存借用，同实例重入和回调异常后继续调用均安全；异常身份原样保留。加载器检测新方法，拒绝不支持候选接口的旧二进制。

```sh
pnpm --filter weapp-tailwindcss exec node native/build.mjs
pnpm --filter weapp-tailwindcss exec tsx native/test/transform.ts
pnpm --filter weapp-tailwindcss exec tsx native/test/transform/babel.ts
pnpm --filter weapp-tailwindcss exec tsx native/test/transform/candidates.ts
pnpm --filter weapp-tailwindcss exec tsx native/test/transform/benchmark.ts
pnpm --filter weapp-tailwindcss exec tsx native/test/transform/adapter-benchmark.ts
```

设置 `WEAPP_TW_NATIVE_PATH` 可选择明确的构建产物。默认根据当前系统、架构和 Linux libc 选择本地 binding。

差分验证直接消费生产 `transformLiteralText`，覆盖默认/自定义字典、JS String.replace 的 `$` 替换语义、UTF-16、四种语法与显式括号、原子类集合更新，以及 2,000 组可复现随机 token。完整 Babel/插件回归由集成层单独执行。

`candidates.ts` 验证不同规模集合的查询次数、原地集合与映射变更、精确匹配、fallback、异常身份和重入。

`babel.ts` 进一步直接消费生产 `jsHandler`，同时对拍新旧 ABI，覆盖 class 上下文、module 字符串、directive、模板正文首尾花括号、script/module 与非法作用域输入；同时断言有效输入真实进入 Rust，避免宽泛回退掩盖差异。

基准固定 125,082 UTF-8 字节输入，SHA256 为 `21ad19ea581c664217f72ee2acebc73921de585c680e420c3de594deea09bcf3`。使用同一 Node/Oxc/输入做三轮、每轮 20 对交替采样，每次比较完整代码。冷路径包含 parse、walk 与替换；热路径复用分析事实。另行记录 6/1,000/10,000/100,000 项集合的原生构造/更新与 TS 内容校验开销。

`benchmark.ts` 仍测旧快照 ABI 与同步成本，只用于历史内核比较。`adapter-benchmark.ts` 才覆盖生产 `createJsHandler` 的配置检查、实例缓存、候选回调、转译和真实原生执行次数，并记录 6/1,000/10,000/100,000 项集合的冷/热路径。执行前必须确认 instrumentation 统计 `transformWithCandidates`，factory 的 ABI probe 不能当作成功转译证据。

2026-10-05 的公开 adapter 报告为 `.tmp/rust-native/adapter-candidates-benchmark.json`：500 次转换全部使用新接口，6/1,000/10,000/100,000 项集合的冷原生 p50 分别为 3.169、2.849、5.496、3.369 ms，热原生 p50 分别为 1.033、1.028、1.258、0.881 ms；关闭原生的对应冷/热中位数为 13.731/2.503、8.273/1.921、40.690/3.723、12.174/1.829 ms。数据仅覆盖公开 handler。

完整 adapter 数据也不代表整个项目构建速度；实际框架收益还需单独运行 Vite 冷构建、文本/新增类 HMR 和峰值内存采样。
