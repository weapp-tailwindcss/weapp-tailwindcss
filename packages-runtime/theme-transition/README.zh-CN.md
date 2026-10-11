# theme-transition

> [English](./README.md) | 简体中文

这个包提供主题切换运行时和 Tailwind 插件，封装 View Transition API，并在不支持时自动降级到普通主题切换。

## 动画预设

```ts
import { useToggleTheme } from 'theme-transition'

const { toggleTheme } = useToggleTheme({
  preset: 'fade',
  isCurrentDark: () => document.documentElement.classList.contains('dark'),
  toggle: () => document.documentElement.classList.toggle('dark'),
})
```

| 预设 | 默认时长 | 默认缓动 | 效果 |
| --- | ---: | --- | --- |
| `circle` | 400ms | `ease-in` | 从指针位置圆形展开或收起，也是默认行为 |
| `fade` | 240ms | `ease-in-out` | 新旧主题柔和淡入淡出 |
| `wipe` | 320ms | `cubic-bezier(0.4, 0, 0.2, 1)` | 从右侧向左揭示新主题 |
| `slide` | 280ms | `cubic-bezier(0.22, 1, 0.36, 1)` | 新主题从右侧轻移淡入，旧主题向左淡出 |

`duration` 和 `easing` 可以覆盖当前预设的默认 timing。精确 `(0, 0)`、键盘激活、减少动态效果或浏览器不支持 View Transition 时会直接切换主题。

## 官网

更多接入方式、配置说明和框架示例见 [weapp-tailwindcss 官方文档](https://tw.weapp.dev)。
