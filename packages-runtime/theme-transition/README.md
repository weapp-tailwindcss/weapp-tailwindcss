# theme-transition

> English | [简体中文](./README.zh-CN.md)

This package provides a theme transition runtime and Tailwind plugin, wrapping the View Transition API and falling back to normal theme toggles when unsupported.

## Animation presets

```ts
import { useToggleTheme } from 'theme-transition'

const { toggleTheme } = useToggleTheme({
  preset: 'fade',
  isCurrentDark: () => document.documentElement.classList.contains('dark'),
  toggle: () => document.documentElement.classList.toggle('dark'),
})
```

| Preset | Default duration | Default easing | Effect |
| --- | ---: | --- | --- |
| `circle` | 400ms | `ease-in` | Expands or contracts from the pointer and remains the default |
| `fade` | 240ms | `ease-in-out` | Gently fades between themes |
| `wipe` | 320ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Reveals the new theme from right to left |
| `slide` | 280ms | `cubic-bezier(0.22, 1, 0.36, 1)` | Slides the new theme in from the right while fading |

`duration` and `easing` override the selected preset defaults. Exact `(0, 0)` coordinates, keyboard activation, reduced motion, or missing View Transition support fall back to an immediate theme change.

## Website

For setup guides, configuration references, and framework examples, see the [official weapp-tailwindcss documentation](https://tw.weapp.dev).
