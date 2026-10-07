---
"weapp-tailwindcss": patch
"@weapp-tailwindcss/engine": patch
---

限制源码候选扫描与 Engine 原始候选补扫、无方括号任意值补扫、位置报告的并发文件读取，避免多个构建入口同时扫描时耗尽文件描述符；保留全部候选、来源隔离和报告顺序。

Webpack watch 扫描失败时等待在途操作结束，保留原始错误，并在整轮成功后一起发布候选快照和文件元数据，避免失败后的重试漏掉变更。
