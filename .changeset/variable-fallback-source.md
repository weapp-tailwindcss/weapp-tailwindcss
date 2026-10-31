---
"@weapp-tailwindcss/postcss": patch
---

保留 Tailwind v4 变量 fallback 拆分时函数、参数与逗号的解析来源；新增逗号使用本阶段输入中的零宽锚点，正确处理尾空白、未闭合函数和 UTF-16 位置。保持已有序列化结果、注释与显式 fallback 行为。
