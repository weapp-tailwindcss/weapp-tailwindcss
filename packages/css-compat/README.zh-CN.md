# @weapp-tailwindcss/css-compat

> [English](./README.md) | 简体中文

框架无关的 CSS layer 兼容内核。首期版本为 `0.1.0`，只提供 layer 注册、顺序编译和定位诊断；不生成 class，不转换 runtime，不扫描文件，也不注入 Tailwind 默认值。

## 安装与入口

```sh
pnpm add -D @weapp-tailwindcss/css-compat postcss
```

支持 Node `^22.18.0 || >=24.11.0`、PostCSS `^8.5.29`。根入口和 `/layers` 提供编译器与插件，`/diagnostics` 提供诊断类型及 `CascadeLayerError`，`/legacy` 提供旧 anchor 算法。每个入口均有 ESM/CJS 及对应声明。

## AST API

```ts
import { compileCascadeLayers } from '@weapp-tailwindcss/css-compat/layers'
import postcss from 'postcss'

const root = postcss.parse(css, { from: 'input.css' })
const result = compileCascadeLayers(root, {
  mode: 'ordered',
  onConflict: 'warning',
  inputStage: 'native',
})
console.log(result.root.toString(), result.diagnostics)
```

`mode` 必填。`ordered` 在全部输入检查和冲突分析完成后原地修改 Root，返回同一个 Root 与诊断数组；失败抛出携带诊断的 `CascadeLayerError`，原始节点身份、结构和内容均不变。`preserve` 原样返回，适合支持原生 layer 的 Web 目标。`onConflict` 默认 `warning`，设为 `error` 时保守诊断也阻止编译。

`inputStage` 默认 `native`；明确知道上游已经 polyfill 的输入应传 `polyfilled`，ordered 会拒绝它。未提供来源信息的已展平 CSS 无法恢复层语义；内核不会根据 `:not(...)` 的形状猜测来源，也不会清理作者选择器。

## PostCSS 插件与顺序

```ts
import { createCascadeLayersPlugin } from '@weapp-tailwindcss/css-compat'
import postcss from 'postcss'

const result = await postcss([
  // 在此之前完成生成器、import、条件编译及 nesting 展开。
  createCascadeLayersPlugin({ mode: 'ordered', onConflict: 'error' }),
]).process(css, { from: 'input.css', to: 'output.css', map: { inline: false } })
```

插件在 `OnceExit` 编译；将它放在 import/nesting 等前置插件之后。诊断通过 PostCSS warnings 输出，warning 带稳定 `code` 与完整 `diagnostic`。字符串处理使用 PostCSS 原生 `process`，保留 from/to/map/result messages。

变量安全分析必须在原变量作用域与 layer 信息仍存在时进行。selector/value 转换可能改变权重或引入覆盖，调用者应先完成这些变换，再对最终选择器运行 ordered；不要把生成的两段 CSS 分别展平后再拼接。

## 顺序兼容契约

| 能力 | 行为 |
| --- | --- |
| 命名、重复、点分、嵌套、匿名、转义层 | 首次注册确定顺序；匿名身份不与作者名称合并 |
| 普通声明 | 子层在父层直接声明之前，较晚层优先，未分层最高 |
| important | 层优先级反转，未分层最低；同层 fallback 保持源顺序 |
| 条件与 source map | 保留 wrapper 和来源；条件内首次注册产生诊断 |
| descriptor | 完整保留，不拆分、不重复；跨层同名或身份不明的定义产生保守诊断 |
| 无 layer、重复处理 | 不重排无 layer 输入；同 Root、序列化重读与处理器复用稳定 |
| 跨层不同 specificity | 潜在冲突诊断；顺序展开不能等价模拟任意 CSS cascade |

普通和 important 分别分析属性及 selector list 的权重倒置。属性名通过 tokenizer 解码，自定义属性继续区分大小写；别名归一后简写展开长写，逻辑/物理属性、reset shorthand 与未知属性保守处理。选择器是否相交、条件是否互斥不会被静态证明，因此诊断可能包含保守误报；strict 适用于愿意调整这类输入的消费者。

任何未展开的 import、`revert-layer`、nesting、非法层名、未消费的条件编译控制注释和明确 polyfilled 的输入始终报错；这些输入不能靠将 onConflict 改为 warning 放行。字符串和 URL 中的同名字样不被当作语法。

## 诊断

诊断包含 `code`、`severity`、`message`、`suggestion`、`source`，以及可用的 `related`、`layer`、`selector`、`property`。source 包含可用的 file/line/column，人工创建且没有 source 的节点不会伪造位置。

| code | 含义 |
| --- | --- |
| `LAYER_OPTIONS` | API 选项非法 |
| `LAYER_INPUT_STAGE` | 来源明确已被 polyfill |
| `LAYER_IMPORT` | 未展开 import 或不合法的 prologue 位置 |
| `LAYER_REVERT` | 输入包含 revert-layer |
| `LAYER_NESTING` | 尚未展开的 nesting 或不合法声明位置 |
| `LAYER_NAME` | 层名或声明列表非法 |
| `LAYER_PREPROCESSOR` | 未消费条件编译控制注释 |
| `LAYER_CONDITIONAL_ORDER` | 条件中的首次层注册 |
| `LAYER_SPECIFICITY` | 跨层潜在权重倒置 |
| `LAYER_SELECTOR_UNKNOWN` | 无法可靠分析的选择器 |
| `LAYER_DESCRIPTOR_ORDER` | 跨层同名 descriptor 需要验证 |
| `LAYER_WRAPPER_SEMANTICS` | 不可证明等价的作用域/未知包装规则 |

## 作用域与迁移

一个 Root 只代表一个已合并的级联作用域。按真实 import/build graph 合并输入后再编译；app/page/component 样式隔离、独立分包和多目标分别建立模型。调用者拥有图关系、HMR 失效和缓存，内核每次调用独立持有状态。

现有 `@weapp-tailwindcss/postcss/transform` 的 `consumeCascadeLayers(root)` 转导出 `/legacy`，保持旧 anchor 行为，包括原来的语义限制。新 ordered API 不替换线上默认策略；Web 默认为原生层保留。Tailwind preflight/theme/components 标记、Panda codec/recipe/runtime 继续由对应 adapter 负责。

Panda 2.1.2 应关闭生成器 polyfill，将生成 CSS 交给本包的公开插件；本期提供隔离 tarball 消费测试，不修改 Panda 仓库。后续再逐项提取 selector、变量、单位和颜色能力。

## 验证

```sh
pnpm --filter @weapp-tailwindcss/css-compat build
pnpm --filter @weapp-tailwindcss/css-compat test
pnpm --filter @weapp-tailwindcss/css-compat typecheck
pnpm --filter @weapp-tailwindcss/css-compat properties:check
pnpm --filter @weapp-tailwindcss/css-compat test:package
pnpm --filter @weapp-tailwindcss/css-compat test:consumers
pnpm --filter @weapp-tailwindcss/css-compat test:browser
pnpm --filter @weapp-tailwindcss/css-compat bench
```

消费测试先构建本 worktree 的 PostCSS 及生成引擎依赖；浏览器测试需要当前 Playwright 对应的 Chromium、Firefox、WebKit 二进制，缺失时失败，不静默 skip。三个引擎依次后台运行，均定向释放 browser/context/page。包级证据不代表真实微信或全平台验收。属性映射由固定 `mdn-data@2.37.2`（CC0-1.0）生成，运行 `properties:generate` 更新。
