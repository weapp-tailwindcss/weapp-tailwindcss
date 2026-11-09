---
"weapp-tailwindcss": patch
---

修复 Android Vapor 并发生成超过 128 个样式作用域时，缓存提前淘汰仍在执行的作用域、导致局部 Tailwind CSS 未提交的问题。仅淘汰空闲 LRU 作用域；所有作用域均繁忙时临时超过缓存上限，任务完成后再回收。
