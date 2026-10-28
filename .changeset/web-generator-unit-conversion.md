---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

Web 生成器在计算表达式后执行显式单位规则，使任意值工具类直接得到约定的 Web 单位。Vite 的跨资产计算阶段继续延迟单位处理，避免同单位缩放与组合转换被重复执行；完整生成、增量生成和缓存复用共用相同约束。
