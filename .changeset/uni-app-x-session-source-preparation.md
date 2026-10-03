---
"@weapp-tailwindcss/engine": patch
"weapp-tailwindcss": patch
---

将 uni-app x 局部 utility 排序接入生成会话，复用该扫描模式实际 CSS 的 design system，避免排序与候选校验重复加载。新增可选的非语义来源准备回调，保留完整来源身份、平台候选规范化、依赖失效与失败重试；候选删除时仅重建编译器，复用已准备的 CSS。会话在平台或规范化配置变化后重建，失效或释放后的异步结果不再进入当前缓存。
