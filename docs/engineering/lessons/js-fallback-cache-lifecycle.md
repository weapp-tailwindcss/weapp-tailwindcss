---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/f0f4da82efe3e5df32840adb02e168d017f8cb7b
baseline: f0f4da82efe3e5df32840adb02e168d017f8cb7b
regressions:
  - packages/weapp-tailwindcss/test/js/handler-cache-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/js/index-handler.test.ts
  - packages/weapp-tailwindcss/test/js/native-transform.test.ts
---

# JS 回退缓存的可变输入生命周期

## 症状

`createJsHandler` 在 Babel 和 Oxc 回退路径复用短结果时，同一个 `classNameSet` 新增、清空或等长替换成员仍得到旧输出。`escapeMap` 原地修改、复用 override 对象、更换 `jsPreserveClass` 或改变回调闭包状态，也会复用过期结果。首次运行的 16 项最小回归全部失败。

## 根因与纠正

结果指纹只记录集合身份并永久缓存；合并配置只按 override 对象身份缓存；字符替换、已转义候选以及 escape 包内部同样按映射身份缓存。仅清空最终结果不能修复下游旧映射。

现在 handler 入口按配置内容生成版本，在内容改变时重新创建合并配置，并向下游传递独立冻结的映射快照。集合版本比较长度与全部成员，覆盖同大小 delete/add。短结果仍使用有界 LRU；自定义回调可能读取外部状态，必须每次执行，不能由函数身份推断可缓存。内置星号策略保持可缓存，正则匹配配置的 source 与 flags 均进入指纹。

配置签名只读取数据描述符，不执行 getter。自定义 `Set.has`、子类、Proxy、映射 getter 和有状态正则直接走 Babel，不进入快照、原生或短结果缓存。追加的 4 项对拍先暴露多余的 `has` 查询和 getter 读取，修复后输出与逐次调用次数均与 Babel 一致。

原生完整转换仍先于短结果查询，保留 `required` 加载检查、原生集合与映射校验，以及原生 `null` 直接交给 Babel 的边界。

## 验证

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/js/handler-cache-lifecycle.test.ts test/js/index-handler.test.ts test/js/native-transform.test.ts test/js/oxc-fast-path.test.ts test/js/handlers-stale-fallback-regression.test.ts test/js/literal-transform.test.ts test/ci/architecture-contract.test.ts --update=none --coverage.enabled=false
pnpm --filter 'weapp-tailwindcss^...' run build
pnpm --filter weapp-tailwindcss run build
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false
```

7 个定向测试文件、91 项测试通过，其中生命周期矩阵 26 项。严格类型检查通过；依赖构建后重新检查，未将缺少本地声明产物导致的首次失败视为类型通过。原有测试只调整两项不再成立的内部假设：映射与用户对象同一引用、自定义回调也缓存；分别改为断言冻结快照，以及用内置无外部状态的策略验证缓存命中。集合内容只在原生校验或回退结果缓存中的一个阶段检查，不连续扫描两遍。

## 适用边界

本修复覆盖 `createJsHandler` 的入口与其 Babel/Oxc 回退消费，不修改 escape 包公开实现。绕过工厂直接调用底层 `jsHandler`、`transformLiteralText` 或共享字符函数的可变映射缓存不在此次范围。工厂顶层默认值仍在创建时固定；逐次变更通过每次传入的 override 生效。

内容检查包含线性集合扫描与配置序列化，真实适配器采样必须计入这部分开销。这里不提供性能提升结论，也不代表真实框架 HMR 或全端验收；没有修改 demo 或 static 基线。

## 规则评估

不新增规则，以最小失败回归和现有缓存边界要求约束生命周期。
