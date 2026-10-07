---
"weapp-tailwindcss": patch
---

修复 uni-app X H5 生产 CSS 在 reset 重排后沿用旧内容 hash 的问题：在 Vite 资源发射前完成重排，保持文件名和引用一致，并去除压缩后失去注释的重复 reset。Refs #1271
