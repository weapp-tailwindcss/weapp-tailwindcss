---
"@weapp-tailwindcss/hbuilderx-runner": patch
---

修复 macOS 已退出子进程组回收期间短暂 EPERM 被永久误报为清理失败的问题，仍严格等待根 close 与本轮组消失并保留未确认错误。
