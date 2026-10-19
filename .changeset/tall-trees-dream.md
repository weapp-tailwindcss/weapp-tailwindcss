---
"@weapp-tailwindcss/engine": patch
---

修复多个 CSS 入口的配置与插件相对路径丢失来源目录，按各自入口固定模块身份，避免错误解析到首个入口。
