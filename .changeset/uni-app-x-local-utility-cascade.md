---
"@weapp-tailwindcss/engine": patch
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复 uni-app x 自动局部 utility 别名按模板出现顺序生成，导致同优先级样式覆盖顺序与 Tailwind 不一致的问题。根据当前实际生成来源、主题和目标兼容候选的 Tailwind 排名，稳定排序同一父级内连续的自动局部规则，保留作者规则、未知排名和层叠边界；作者样式重放同时清理内部排序标记，避免标记进入最终产物。
