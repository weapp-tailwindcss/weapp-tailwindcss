---
"@weapp-tailwindcss/postcss": patch
---

按 CSS Alignment 的完整值组展开 `place-content`、`place-items` 和 `place-self`，保留 `safe center`、基线位置及双值对齐的语义；内容基线省略第二值时正确回退为 `start`。无法静态解析的变量或无效简写保留原声明，避免生成错误长写或丢失输入，并继续尊重 preset-env 的功能与保留配置。
