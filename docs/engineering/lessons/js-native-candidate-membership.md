---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/7d0c56c06c9913f12be725824b89e3fe9d02c739
baseline: 7d0c56c06c9913f12be725824b89e3fe9d02c739
regressions:
  - packages/weapp-tailwindcss/test/js/native-transform.test.ts
---

# 原生 JS 按源码候选查询可变集合

## 症状

125 KB 输入的公开 adapter 基准显示，100,000 个类名时原生热转换比关闭原生更慢。Rust 解析缓存已经命中，适配器仍在每次调用中遍历整个 `classNameSet`，首次创建或集合变化时还复制并跨 ABI 传输全部成员。仅测 Rust 内核会遗漏这部分成本。

## 根因与纠正

[此前集合生命周期修复](js-fallback-cache-lifecycle.md)保证了同对象变更不会复用旧决策，但原生边界因此包含 O(集合规模) 的扫描。生产适配器现在创建不持有类名的原生实例，通过 `transformWithCandidates` 同步查询源码实际候选。原值优先精确查询，未命中时才查询不同的转义值；不根据文件或集合大小改变语义。

成员判断仅在一次转换内去重，不能放入跨调用缓存。保留星号、业务路径与条件测试无需查询；`alwaysEscape` 也不调用成员回调。自定义 Set、Proxy 和带 getter 的配置仍由工厂交给 Babel，公开 TypeScript API 不变。旧的 `transform` / `replaceClassNames` ABI 保留其独立集合行为。

原生方法采用共享实例引用，解析缓存保存 `Rc` 所有权，并在调用 JavaScript 之前释放全部 `RefCell` 借用。回调可以重入同一实例或更新旧接口集合；异常原样传播，缓存不保存回调、成员判断或错误。解析缓存仍限制为 128 项与 2 MiB，正在执行的调用通过独立引用持有被淘汰的分析结果。

`src/native.ts` 加载阶段创建空实例并检测 `transformWithCandidates`。缺少新方法的旧二进制在 auto 模式下不可用，required 模式报错，防止旧方法忽略附加参数而静默漏转译。原生 `null` 仍直接回退 Babel。

## 验证

```sh
cargo test --manifest-path packages/weapp-tailwindcss/native/Cargo.toml
pnpm --filter weapp-tailwindcss exec node native/build.mjs
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/js/native-transform.test.ts test/js/handler-cache-lifecycle.test.ts --update=none --coverage.enabled=false
WEAPP_TW_NATIVE=required pnpm --filter weapp-tailwindcss exec tsx native/test/transform/candidates.ts
WEAPP_TW_NATIVE=required pnpm --filter weapp-tailwindcss exec tsx native/test/transform/babel.ts
```

原生补充回归见 [Rust 候选测试](../../../packages/weapp-tailwindcss/native/src/js/transform/candidate_tests.rs)、[真实 ABI 生命周期](../../../packages/weapp-tailwindcss/native/test/transform/candidates.ts) 和 [Babel 矩阵](../../../packages/weapp-tailwindcss/native/test/transform/babel.ts)。

Node 24.18.0、Rust 1.96.0 下，Rust 单测 40 项、adapter 与缓存回归 47 项通过，严格 TypeScript 与 ESLint 检查通过。真实 ABI 在 0、6、1,000、10,000、100,000 个背景类名下，同一源码均只发生 3 次成员查询，覆盖 add/delete/clear、等长替换、转义值命中、映射原地变更与删除、异常身份、重入和缓存淘汰。Babel 矩阵的 6,224 个有效组合输出一致，1,024 个不支持组合保持回退，新旧 ABI 同时对拍。

## 适用边界

这里验证接口复杂度与语义，不把查询次数当作构建速度结论。完整 adapter 的冷/热交替采样与真实 Vite 构建/HMR/内存验证应在集成后的相同 SHA、Node、输入哈希上运行。回退短结果缓存仍有集合内容检查，本修改仅消除原生成功路径的全量扫描。不修改 demo、static 基线或完整 PostCSS 管线。

## 规则评估

不新增规则。以真实 ABI 的生命周期、异常与重入测试约束边界，性能基准必须覆盖公开适配器。
