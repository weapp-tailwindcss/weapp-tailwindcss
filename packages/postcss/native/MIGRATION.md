# CSS Rust 迁移覆盖清单

此清单按实际生产消费路径记录。保留 TypeScript 公开 API 和用户 PostCSS 回调，不等于项目自有转换已经迁移。

| 模块 / 语义 | 当前状态 | 原生消费路径 / 剩余工作 |
| --- | --- | --- |
| `selectorParser/rule-transformer.ts` 类名、简单 ID、组合器、列表、嵌套符 | 部分迁移 | `transformSelector` 完成 tokenize/解码/转义/序列化；原有简单 ASCII 跳过路径保留 |
| `selectorParser/rule-transformer/nodes.ts` class escape | 部分迁移 | 原生接管的完整 selector 在 Rust 处理；custom map 和复杂 selector 仍由 AST 处理 |
| `selectorParser/rule-transformer/pseudos.ts` 复杂伪类、`:where` 展开、RTL、伪元素 | 待迁移 | 仍为 PostCSS selector AST；必须维持分支顺序与删规则语义 |
| `selectorParser/rule-transformer/unsupported-pseudos.ts` 平台伪类移除 | 待迁移 | 仍由 TypeScript 处理 |
| `selectorParser/spacing.ts` space/divide 选择器与声明归一化 | 待迁移 | 声明镜像、去重、变量顺序需一起迁移 |
| `compat/tailwindcss-v4/declarations/variable-fallbacks.ts` 三个 var/gradient fallback 阶段 | 部分迁移 | Rust UTF-16 value AST 一次解析处理；不完整值与超过 256 层嵌套回退原解析器，其他完整语法由差分验收 |
| `compat/tailwindcss-v4/declarations.ts` radius clamp、声明删除 | 待迁移 | 仍由 TypeScript 处理 |
| `compat/tailwindcss-v4/gradients.ts` 方向、infinity/calc | 待迁移 | 仍由 TypeScript 处理；依赖父规则的上下文需明确传入 |
| `compat/uni-app-x-uvue/transform-value.ts` translate 参数分隔符 | 部分迁移 | 生产声明批次由 Rust AST 处理，保留嵌套 var fallback 与字符串/URL/注释；不完整值逐项回退 |
| `compat/uni-app-x-uvue.ts` calc 检测、选择器资格、警告/规则删除 | 待迁移 | 插件 warning/error 回调保留 TS，资格计算与变换仍待迁移 |
| `compat/uni-app-x-uvue/theme.ts` 变量展开 | 待迁移 | 变量生命周期与来源优先级需保持 |
| `compat/tailwindcss-rpx.ts` rpx/rem 与属性纠正 | 待迁移 | 包括 JS `toFixed` 精确数值行为 |
| `compat/color-mix/**` 与 modern color | 待迁移 | 不能用 Lightning CSS 默认序列化替代现有兼容语义 |
| `compat/mini-program-css/**` cascade/layer/root cleanup/import shell | 待迁移 | 规则/声明顺序与输出归属待保持 |
| `compat/legacy-css/**` selector/unit/dedupe | 待迁移 | 与 legacy 产物的对应关系仍在 TS |
| `compat/web-css.ts`、`compat/lynx-css.ts` | 待迁移 | 平台特有规则尚未接管 |
| `compat/tailwindcss-v4/user-css/**` 与 author source | 待迁移 | 路径发现不属于 Rust CSS 内核；CSS 指令转换仍待迁移 |
| `syntax/parse.ts` 通用 CSS/SCSS parser、stringifier | 待迁移 | PostCSS/SCSS AST 仍在 JS；用户插件 API 必须保留 |
| `syntax/css-import.ts`、`syntax/location-dependencies.ts` | 待迁移 | CSS tokenizer 与 URL/source 语义仍在 JS |
| `syntax/runtime-signature.ts` | 待迁移 | raw 字段、token 边界、malformed fallback 需要逐项对拍 |
| `utils/css-custom-property.ts`、`utils/css-calc-context.ts` | 待迁移 | 值解析、依赖拓扑和循环语义尚未接管 |
| `plugins/**` / `pipeline.ts` 用户 PostCSS 插件与公共回调 | JS 合约保留 | 本清单不把回调层保留解释为其内部自有转换已迁移 |

当前二进制内部的 value AST 不跨 NAPI，也没有替换第三方公开 value-parser API。每次扩展必须增加实际生产调用、fixture 差分和覆盖记录；纯导出与 microbenchmark 不算迁移完成。
