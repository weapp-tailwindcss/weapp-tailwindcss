---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复 legacy-web 的 Tailwind CSS v4 数值除法与表单 reset specificity，并诊断低于 Chrome 91 的 Vite CSS 目标。Refs #1363，Refs #1364。
