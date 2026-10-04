---
"@weapp-tailwindcss/postcss": patch
---

修复复用同一配置对象并修改选择器选项后，原生转换与 JavaScript 回退读取时机不同、或结果缓存仍使用旧配置的问题。root、universal、child 替换数组、hover/active/focus 开关、uniAppX 与 escapeMap 按有效内容生成配置快照，内容变化时同步重建转换器及缓存，保持与等价新配置对象一致；支持等长数组原地修改和开关往返。
