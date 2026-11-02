---
"weapp-tailwindcss": patch
---

修复 uni-app x 前插 preflight 后样式请求索引错位、原生子请求覆盖完整 SFC 样式来源和外部 scoped 样式丢失局部规则的问题。按最终 SFC 快照回放样式并保留预处理产物、级联顺序及增量删除语义。Refs #1325。
