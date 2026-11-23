---
'weapp-tailwindcss': patch
---

修复 Tailwind CSS v4 文件扫描增量缓存无法识别已删除后恢复的源码文件，避免恢复后的新候选继续使用旧生成结果。
