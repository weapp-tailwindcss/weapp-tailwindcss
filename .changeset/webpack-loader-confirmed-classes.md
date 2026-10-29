---
"weapp-tailwindcss": patch
---

在 Webpack 小程序产物转译前，按本轮活动样式资产的真实来源关系收集可复用 loader 已确认的类名，避免这些类名直到 CSS 阶段才加入集合而使 HTML、JS 漏转译。继续拒绝陈旧或未绑定的 loader 记录，不扩大未确认字符串的转译范围，CSS 生成仍可消费 JS 转译后发现的候选。

HTML、JS 处理缓存同时绑定本轮精确类名集合；JS chunk 不变而 loader 确认集合变化时重新转译，避免回放旧结果或复活已移除的类名。
