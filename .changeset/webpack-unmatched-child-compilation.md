---
"weapp-tailwindcss": patch
---

避免 Webpack 无匹配产物的子编译重复收集类名，并保留父编译的刷新状态与缓存。

Mpx 的 WXS 子编译在 CSS、模板和 JS matcher 均未命中时直接结束本轮转换准备；用户显式匹配 WXS、JS、模板或样式的子编译继续走现有转换链路。
