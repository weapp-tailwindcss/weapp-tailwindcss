---
"weapp-tailwindcss": patch
---

由本包维护公开的包解析配置类型，保留 paths 与 posix、win32、auto 平台选项，避免消费者为了使用 generator 或 preset 被迫加载第三方包管理工具的全部声明。修复 local-pkg 1.2.1 发布声明引用未定义 Args 导致严格 TypeScript 消费失败的问题，不改变运行时包解析行为。
