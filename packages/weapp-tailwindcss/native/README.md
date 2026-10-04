# Rust 编译内核

跨平台包布局、版本联动与发布门禁见 [Rust 内核分发与发布](./DISTRIBUTION.md)。

当前内核通过 Node-API 提供 WXML 属性值 tokenizer、JavaScript 字面量分析/完整转换与运行时签名。公开 TypeScript API 不变，原生 binding 不可用时沿用 JavaScript/Babel 兼容路径。`WEAPP_TW_NATIVE=auto` 自动加载，`off` 强制回退，`required` 在缺失 binding 时失败，供原生验收使用。

静态 WXML 属性值由 `createWxmlTransformer` 创建的实例完成扫描、精确匹配、转义与输出组装；动态表达式保留原流程。ABI、回调与自定义表边界见 [WXML 静态转换](WXML.md)。

## 构建与验证

```sh
pnpm --filter weapp-tailwindcss exec node native/build.mjs
pnpm --filter weapp-tailwindcss exec node native/verify.mjs
```

构建脚本直接调用已安装的 Rust 工具链。交叉构建使用 `--target=<Rust target triple>`，目标工具链、链接器和平台 SDK 由调用方准备；脚本不自动安装系统工具。支持 macOS arm64/x64、Windows MSVC arm64/x64、Linux GNU/musl arm64/x64。二进制写入 `native/bindings`，不得提交产物或在用户安装时隐式编译。

`verify.mjs` 强制使用 native，包含 WXML 确定性随机输入、Unicode/畸形边界、JS 解析矩阵、完整转换与可变集合/映射的真实 ABI 对照。WXML 输出同一进程交替采样的微基准结果；它只证明 tokenizer 的语义和局部耗时，不代表完整构建或 HMR 加速。

## WXML ABI

`tokenizeWxml(source)` 接收 UTF-16 字符串，返回 `Uint32Array`：每个 token 由 `start, end, expressionCount` 开始，后接对应数量的 `expressionStart, expressionEnd`。所有 offset 都是 JavaScript code unit，区间左闭右开。

TypeScript 从原输入切片恢复 token 与表达式的 value，因此不经过有损 UTF-8 转换。保留已有 8 种空白字符和首个 `}}` 结束表达式的状态机语义，包括未闭合与嵌套括号，不将 Rust 的 Unicode 空白分类引入现有 API。

## JS ABI

`analyzeJs` 返回带 UTF-16 位置、条件测试与 class 上下文的字面量事实。模板元素区间只包含正文，不包含反引号或插值边界。`jsRuntimeSignature` 返回紧凑的运行时依赖签名，空签名有效。

`createJsTransformer` 返回由 JS GC 拥有的原生实例。生产适配器传入空集合与最终有效转义映射，再通过 `transformWithCandidates` 在 Rust 中完成解析和替换；成员回调只查询当前源码实际候选，同一次调用去重，不遍历或复制整个 classSet。集合原地修改在下一次调用立即生效，映射内容变化重建实例。旧 `transform/replaceClassNames` 快照接口保留供 ABI 对照，生产路径不再使用。加载器拒绝缺少候选查询方法的旧二进制。

`null` 表示该输入应走 Babel，异常直接上抛，不按兼容失败处理。缓存只持有解析事实，进入同步成员回调前释放内部可变借用，支持回调异常与同实例重入。

完整 JS 转换暂沿用 `experimentalJsFastPath` 的启用范围。source map、自定义用户回调和需要 Babel 的 module graph/ignore 场景不移交原生。性能测量与语义边界见 [JS 内核验证记录](../../../docs/engineering/lessons/rust-js-native-boundary.md) 和 [完整转换基准](./test/transform/README.md)。
