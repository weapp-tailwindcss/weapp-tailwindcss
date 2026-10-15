---
"@weapp-tailwindcss/react-native": patch
---

修复 Metro 文件监听遗漏原生通知时首次保存和后续保存不刷新的问题；同步建立文件版本基线并定期核对，关闭监听时释放核对计时器。
