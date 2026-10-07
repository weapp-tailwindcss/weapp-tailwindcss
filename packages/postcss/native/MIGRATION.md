# CSS Rust 迁移覆盖清单

此清单按实际生产消费路径记录。保留 TypeScript 公开 API 和用户 PostCSS 回调，不等于项目自有转换已经迁移。

| 模块 / 语义 | 当前状态 | 原生消费路径 / 剩余工作 |
| --- | --- | --- |
| `selectorParser/rule-transformer.ts` 类名、ID、组合器、列表、嵌套符与规则动作 | 部分迁移 | `SelectorRuleTransformer` 配置一次、每条规则一次调用；Rust AST 返回更新/删除/spacing 动作，原有简单 ASCII 跳过路径保留；parser 特殊语法回退 |
| `selectorParser/rule-transformer/nodes.ts` class escape、root/universal、属性与子代转换 | 部分迁移 | Rust 接管支持的完整 selector；custom map、注释、namespace、特殊 escape 与小数 keyframes 仍走兼容 AST |
| `selectorParser/rule-transformer/pseudos.ts` 复杂伪类、`:where` 展开、RTL、伪元素 | 自有转换已接线，解析边界仍回退 | Rust arena 保持 pre-order、删除与插入顺序、嵌套 is/where 展开、uniAppX 分支和空节点清理；未接管 parser/custom map 使用原实现 |
| `selectorParser/rule-transformer/unsupported-pseudos.ts` 平台伪类移除 | 自有转换已接线，解析边界仍回退 | Rust 持有不支持列表和 hover/active/focus 开关，并删除所属顶层分支；原实现留作 fallback |
| `selectorParser/spacing.ts` space/divide 选择器与声明归一化 | 部分迁移 | selector 资格与替换在 Rust；返回 spacing 动作，由 TS 完成声明镜像、去重、变量顺序；声明阶段尚未迁移 |
| `compat/tailwindcss-v4/declarations/variable-fallbacks.ts` 三个 var/gradient fallback 阶段 | 部分迁移 | Rust UTF-16 value AST 一次解析处理，生产声明并入 `normalizeV4Declaration` 单次调用；不完整值与超过 256 层嵌套回退原解析器 |
| `compat/tailwindcss-v4/declarations.ts` radius clamp、声明删除 | 部分迁移 | radius 数值和正则边界计算由 `normalizeV4Declaration` 接管，保留 IEEE-754 舍入、科学计数法与阶段提前返回；声明删除、AST 所有权和访问顺序仍在 TypeScript |
| `compat/tailwindcss-v4/gradients.ts` 方向、infinity/calc | 部分迁移 | 生产声明组合接口和公开函数均消费 Rust 值计算；父规则首个背景声明的回退方向由 TS 显式传入。跨规则合并、theme 颜色收集与渐变组合生成仍在 TS |
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
| `plugins/auto-calc.ts`、`plugins/colorFunctionalFallback.ts` 与声明清理 | 待迁移 | rpx/calc 资格、函数值转换、声明去重和 specificity 计算仍由自有 TS 实现，不能归入用户回调保留范围 |
| `compat/native/**` React Native 样式编译 | 待迁移 | 此目录的 native 指目标平台；selector 资格、变量/属性转换与样式表编译仍在 TS，未接入 Rust ABI |
| `compat/scoped-css/**`、`compat/processed-css/**`、`compat/webpack-css/**` | 待迁移 | CSS 覆盖比较、指令/规则清理、import 恢复和源码代表性计算仍在 TS；bundler 来源身份及生命周期回调属于上层接口边界 |
| `compat/uni-app-x.ts`、`compat/uni-app-x-author-apply.ts`、`compat/tailwindcss-v4/author-functions.ts` | 待迁移 | important apply 标记、作者 CSS 指令与函数计算仍在 TS；来源路径解析和插件阶段状态不归 Rust 字符串内核 |
| `plugins/**` / `pipeline.ts` 用户 PostCSS 插件与公共回调 | JS 合约保留 | 本清单不把回调层保留解释为其内部自有转换已迁移 |

当前二进制内部的 value AST 不跨 NAPI，也没有替换第三方公开 value-parser API。每次扩展必须增加实际生产调用、fixture 差分和覆盖记录；纯导出与 microbenchmark 不算迁移完成。
