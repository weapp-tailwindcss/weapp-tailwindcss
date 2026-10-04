# WXML 静态属性值内核

Rust 的 `createWxmlTransformer(entries)` 创建只读转义表，`transformStatic(source, contains?)` 完成属性值扫描、空白间隔处理、exact 候选匹配、转义和输出组装。输入与输出均采用 UTF-16，保留孤立代理字符；不会把 Rust 字节偏移交给 JavaScript。

## 支持与回退

- 静态属性值的默认 `all` 模式和默认映射下的 `exact` 模式使用完整 Rust 内核，不在 JavaScript 中重建 token 对象或逐片段更新 MagicString。
- `exact` 仅查询 `runtimeSet` 中精确命中的候选；未匹配文本与原有空白规则保持一致。WXML 分词空白与 JavaScript `/\S+/` 的空白集合不同，分别实现和验证。
- 检测到动态表达式时返回 `null`，且发生在任何成员查询之前。表达式、ignore、自定义 `jsHandler`、原有错误重试继续走 `generateCode`。
- 自定义 tokenizer、选项 getter、重载 `Set.has`、直接使用复杂内置映射，以及 exact 模式的自定义映射继续走 JavaScript。exact 模式无命中时不能提前缓存自定义映射，避免改变首次有效读取的行为。
- htmlparser2 标签/属性解析、自定义属性与正则匹配、inline WXS 和异步回调仍由 TypeScript 拥有。此改动不代表整个 WXML 编译器已经 Rust 化。
- `null` 是语义回退，Node-API 执行异常原样传播。工厂实例只有只读转义表，源码与输出缓冲位于每次调用内部，支持同步回调重入。

普通自定义映射的 `all` 模式通过既有 `escape` 函数获得有效表，保留该函数首次读取后缓存合并表的行为。空 replacement、ASCII 首字符的 identity mapping、非 ASCII replacement 和孤立代理字符均进入差分矩阵。

## ABI 与开销边界

```ts
interface NativeWxmlCompiler {
  createWxmlTransformer(entries: { character: string, replacement: string }[]): {
    transformStatic(source: string, contains?: (candidate: string) => boolean): string | null
  } | null
}
```

每份缓存的有效映射只创建一次工厂。`all` 每个非空且非纯空白的静态属性值调用一次 Node-API；`exact` 额外为每个实际候选调用一次同步 `contains`。不复制、排序或遍历完整 `runtimeSet`，同一个集合原地变更后可立即生效。成员回调仍有 ABI 成本，不能据此直接宣称 exact 模式或完整项目构建加速。

集成时，主 loader 的 `NativeCompiler` 增加 `src/wxml/native/types.ts` 中的 `NativeWxmlCompiler` 接口，并将 `createWxmlTransformer` 加入所需方法名单。napi 宏已自动注册 WXML 子模块，`lib.rs` 不需要重复导出。真实 Vite 原生计数器应记录 `createWxmlTransformer` 与工厂实例的 `transformStatic`；tarball gate 应创建工厂并执行静态转换。

## 本地验证

从仓库根目录运行；Rust 编译器需为 1.96，依赖包需已构建：

```sh
pnpm --filter weapp-tailwindcss exec node native/build.mjs
pnpm --filter weapp-tailwindcss exec tsx native/test/wxml-static.ts
pnpm --filter weapp-tailwindcss exec vitest run test/wxml --update=none --coverage.enabled=false
```

差分与原生回归设置 `WEAPP_TW_NATIVE=required`；同一 WXML 回归另以 `WEAPP_TW_NATIVE=off` 验证回退。环境变量通过操作系统或调用方传入，不在脚本内覆盖已有验收模式。

本轮 Node 24.18.0 / macOS arm64 的真实 ABI 验证包含 10,056 个静态输入、1,500 个自定义映射输入、4 个动态回退输入，涵盖真实 demo class 属性、确定性随机 UTF-16、异常身份、同实例重入和集合变更。exact 路径总共执行 116,301 次成员查询，逐项核对只有实际候选跨越 ABI。输入 SHA-256（JSON 的 UTF-16LE）为 `a94ce5868548d22e428911119a0d90ac4cc88bbdf49be5b4dc8744e85977cfd1`。

Rust 4 项静态内核单测、clippy 通过；WXML 在 required/off 两种模式均为 18 文件、155 项通过。原有 2 个 `it.skip` 不代表本次已覆盖。后续集成的主包严格类型检查使用 `--noCheck false` 已通过；其他 OS/CPU/libc 的实际 Node-API 验证仍由 CI 矩阵负责。

## 公开适配器性能

2026-10-05 使用 Node 24.18.0 / macOS arm64，在同一进程对公开 `templateReplacer` 进行三轮、每轮 20 对交替采样，每个样本连续调用 200 次，预热每种模式与场景各 100 次。计时包含 TypeScript 适配器、同步成员查询和原生调用计数开销；输出比较与哈希不在计时内。exact 集合包含 5,000 项无关类名。动态场景未传自定义 `jsHandler`，按公开默认行为保留表达式。

```sh
pnpm --filter weapp-tailwindcss exec node --import tsx native/test/wxml-benchmark.ts --self-check
pnpm --filter weapp-tailwindcss exec node --import tsx native/test/wxml-benchmark.ts --measure
```

| 属性值场景 | 字节数 | JS p50 / 次 | 原生 p50 / 次 | 比率 |
| --- | ---: | ---: | ---: | ---: |
| 短静态 / all | 45 | 0.006831 ms | 0.000909 ms | 7.51 倍 |
| 短静态 / exact | 45 | 0.006739 ms | 0.001329 ms | 5.07 倍 |
| 短动态 / all | 92 | 0.017030 ms | 0.015530 ms | 1.10 倍 |
| 短动态 / exact | 92 | 0.018470 ms | 0.015101 ms | 1.22 倍 |
| 长静态 / all | 2,968 | 0.801518 ms | 0.016485 ms | 48.62 倍 |
| 长静态 / exact | 2,968 | 0.885944 ms | 0.055913 ms | 15.85 倍 |
| 长动态 / all | 3,015 | 0.888405 ms | 0.813232 ms | 1.09 倍 |
| 长动态 / exact | 3,015 | 0.969649 ms | 0.964878 ms | 1.00 倍 |

p50 为 60 个批次均摊耗时的中位数。480 对全部输出一致，每个场景记录 12,000 次实际内核调用：静态调用 `transformStatic`，动态调用 `tokenizeWxml`。静态路径的替换和组装留在 Rust 中，动态路径仍需 JavaScript 片段处理，因此不能将静态收益推广到动态模板或完整构建。

正式报告为忽略目录中的 `.tmp/rust-native/wxml-benchmark-esm.json`，记录输入 UTF-16 哈希、实际 ESM 依赖入口、锁文件、源码及二进制身份，并在结束时确认未变。采样基线为 `d5d1c330d` 加报告脚本身份校验修订；原生源码摘要为 `9eabb743fb1b10fbaff3061c417667dd6be1ef4c7f47c84e76c329959e5fe2ff`。更早的 `wxml-benchmark.json` 在运行中修改了脚本且记录 CJS 解析入口，作为无效实验保留，不计入结果。
