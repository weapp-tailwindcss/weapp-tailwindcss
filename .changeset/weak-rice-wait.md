---
"weapp-tailwindcss": patch
---

修复 Vite watch 连续重建时框架根样式导入壳缺席的问题，通过构建器资产 API 恢复已登记的导入关系，保留目标 CSS 与组件样式注入。Related to #1284
