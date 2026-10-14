---
"@weapp-tailwindcss/env": patch
---

修复 scripts 检测将引用的变量名或等号误当作 shell 环境赋值的问题，避免后续参数覆盖真实框架依赖；保留合法值引用、续行及 env/cross-env 包装器的赋值参数语义。Refs #1296。
