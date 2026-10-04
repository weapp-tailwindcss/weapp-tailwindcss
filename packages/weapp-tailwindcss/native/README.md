# Rust 编译内核

跨平台包布局、版本联动与发布门禁见 [Rust 内核分发与发布](./DISTRIBUTION.md)。

当前内核通过 Node-API 提供 WXML 属性值 tokenizer、JavaScript 字面量分析/完整转换与运行时签名。公开 TypeScript API 不变，原生 binding 不可用时沿用 JavaScript/Babel 兼容路径。`WEAPP_TW_NATIVE=auto` 自动加载，`off` 强制回退，`required` 在缺失 binding 时失败，供原生验收使用。

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

`createJsTransformer` 接收精确 classSet 与最终有效转义映射，返回由 JS GC 拥有的原生实例；`replaceClassNames` 原子更新集合，`transform` 在实例中完成解析和替换，只返回最终代码。TypeScript 适配器在调用前校验可变集合与映射内容。`null` 表示该输入应走 Babel，异常直接上抛，不按兼容失败处理。

完整 JS 转换暂沿用 `experimentalJsFastPath` 的启用范围。source map、用户回调和需要 Babel 的 module graph/ignore 场景不移交原生。性能测量与语义边界见 [JS 内核验证记录](../../../docs/engineering/lessons/rust-js-native-boundary.md) 和 [完整转换基准](./test/transform/README.md)。
