# 运行时包与 class 写法

## 包选择

| 包 | 使用场景 |
| --- | --- |
| `@weapp-tailwindcss/runtime` | 自定义 runtime factory、escape/unescape、`clsx`、`weappTwIgnore`、rpx transformer |
| `@weapp-tailwindcss/merge` | `twMerge`/`twJoin`、冲突类去重、组件外部 class 覆盖 |
| `@weapp-tailwindcss/cva` | 单槽组件 variants，自动处理小程序转义 |
| `@weapp-tailwindcss/variants` | 多槽 recipes、`tv`/`cn`、Tailwind Variants 语义 |
| `@weapp-tailwindcss/typography` | Typography 的小程序适配 |
| `theme-transition` | 主题过渡运行时与 Tailwind 插件 |
| `@weapp-tailwindcss/ui` | 项目明确采用该原子化 UI 运行时层时 |

当前运行时包的 Node engine 为 `^20.19.0 || >=22.12.0`。`@weapp-tailwindcss/merge` 还公开 `./slim` 与 `./lite`：只有明确接受对应规则集裁剪时才使用子入口，默认仍使用主入口。

`@weapp-tailwindcss/ui` 的默认入口是 CSS；variants、preset、components、utils、hooks 与 adapters 使用各自公开子路径。`theme-transition` 同时公开运行时、Tailwind 插件、SCSS 和 CSS，按消费端选择入口，不把样式入口当成 JavaScript API。

## 动态 class 顺序

1. 静态完整字面量。
2. 条件完整字面量。
3. 枚举映射。
4. `cva` 或 `tv`。
5. 只有外部输入不可枚举时才使用受控 runtime，并保证所需 class 已被 Tailwind 扫描。

推荐：

```ts
const tone = {
  primary: 'bg-blue-500 text-white',
  danger: 'bg-red-500 text-white',
} as const

const className = tone[props.tone]
```

不要使用：

```ts
const className = `bg-${color}-500 px-${size}`
```

## 组件覆盖

```ts
import { clsx, type ClassValue } from '@weapp-tailwindcss/runtime'
import { twMerge } from '@weapp-tailwindcss/merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

`clsx` 负责条件组合，`twMerge` 负责冲突语义。普通自定义颜色通常可直接工作；只有 token 改变冲突分类时才通过 merge 的 create/extend API 同步配置，例如 `text-32` 这类可能被误判为颜色的数字字号。测试最后一个有效 class 获胜，并确认互不冲突的 class 同时保留。

## cva 与 variants

- `cva`：Button、Badge、Input 等单槽组件。
- `variants`/`tv`：Card、Modal、Menu 等多槽组件，或需要 compound variants/slots 的设计系统。
- 保持 builder 定义集中，业务组件只传 variant props 和外部 class。

多槽组件让每个 slot 在调用时接收外部 class：

```ts
import { tv } from '@weapp-tailwindcss/variants'

const alert = tv({
  slots: {
    base: 'rounded-lg p-4',
    icon: 'size-5',
  },
  variants: {
    tone: {
      danger: { base: 'bg-red-600', icon: 'text-white' },
    },
  },
})

const slots = alert({ tone: 'danger' })
const rootClass = slots.base({ class: externalRootClass })
const iconClass = slots.icon({ class: externalIconClass })
```

原生小程序 `externalClasses` 由平台合并，不会自动进入 `cn()`。若组件通过 `root-class` 等属性传递 class，还要在构建配置的 `customAttributes` 中声明该标签和属性，使模板转换器能够处理它。

## 精确忽略

```ts
import { weappTwIgnore } from '@weapp-tailwindcss/runtime'

const rawClass = weappTwIgnore`w-1/2`
```

只对确需原样透传的字符串使用。自定义标签函数名时，将其加入构建配置的 `ignoreTaggedTemplateExpressionIdentifiers`；调用表达式封装名则检查对应 identifier 配置。不要把全局 `String.raw` 当作默认忽略规则。

## 自定义 runtime factory

`createRuntimeFactory` 接收上游 library factory，并按 `CreateOptions` 组合 escape、unescape 和 transform。保持以下不变量：

- 输入 class 在进入上游合并库前只做一次必要转换。
- 输出只恢复一次目标格式。
- transformer 不改变非 class 业务字符串。
- 缓存 key 包含会影响转换结果的配置。
- 淘汰缓存后与冷启动结果一致。

`createRpxLengthTransform()` 只处理明确的长度前缀，不扩大到颜色或任意属性。

## 验证

覆盖条件 class、冲突顺序、自定义 token、任意值、斜杠 class、第三方 raw class、生产压缩、缓存淘汰和所选 subpath 的 ESM/CJS 类型解析。
