# ReactLynx / Rspeedy 接入

## 支持基线

- `@weapp-tailwindcss/lynx` 0.3.2。
- `@lynx-js/rspeedy` >=0.16.0。
- Tailwind CSS 4、Node >=22.12.0。
- 只覆盖 ReactLynx + Rspeedy 原生输出，不覆盖 Rspeedy Web 或非 React Lynx 框架。

## 安装与配置

```bash
pnpm add @weapp-tailwindcss/lynx tailwindcss
```

```ts
// lynx.config.ts
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  plugins: [pluginLynxTailwindcss()],
})
```

使用 theme + utilities 避免引入浏览器 preflight：

```css
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
```

`@source` 相对 CSS 文件解析。插件在构建期静态化 Tailwind theme 变量；应用自定义的动态 CSS 变量保持原样。

## 候选与任意值

使用完整静态字符串：

```tsx
<view className="w-[123px] h-[45rpx] rounded-[18px] bg-[#123456]" />
```

动态场景枚举完整 class，或显式注册有限候选：

```css
@source inline("w-[120px] w-[240px] bg-[#123456]");
```

不要使用 ``className={`w-[${width}px]`}``，Tailwind 无法在构建期枚举最终 token。

## 兼容矩阵

| 类型 | 状态 |
| --- | --- |
| `px`、`rpx`、`calc()`、颜色、渐变、明确 `length:`/`color:` | 已验证生成并进入 bundle |
| CSS 变量 | 已验证；应用自定义变量不被静态化 |
| `!important`、复杂渐变 | 可生成，仍需目标端验收 |
| `padding-inline` 等逻辑属性 | 当前 encoder 可能删除；改用物理方向属性 |
| 任意属性如 `mask-type` | 不支持时会被 encoder 删除 |
| `:is()`、`:where()` 复杂变体 | 当前 encoder 不支持 |
| 伪元素、hover、dark、data、supports | 行为由 Lynx 运行时决定，必须实机验证 |

使用完整 `@import "tailwindcss"` 时，`:root`、`:host`、`:where(...)`、伪元素和部分浏览器属性会产生警告。preflight 规则可通过 theme + utilities 入口移除；业务 utility 对应警告表示该样式不会进入 Lynx 原生样式表，不能只忽略。

## 验证

```bash
pnpm --filter @weapp-tailwindcss/lynx test
pnpm --filter @weapp-tailwindcss/example-react-lynx build
pnpm e2e:lynx
```

静态 bundle 只能证明 CSS 已生成并进入构建产物。伪元素、状态、媒体查询和复杂视觉效果继续在实际 Android/iOS Lynx 运行时验收；仓库 iOS 环境可运行 `pnpm e2e:lynx:ios` 做截图与像素断言。
