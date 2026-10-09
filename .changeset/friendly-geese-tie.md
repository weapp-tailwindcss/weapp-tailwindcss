---
"weapp-tailwindcss": patch
---

修复 Vite 生产 watch 中项目相对 CSS 来源被当作输出身份缓存，确保 SFC 作者样式的相对 reference 在连续重建时仍从源码目录解析。
