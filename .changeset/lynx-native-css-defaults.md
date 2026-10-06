---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
"@weapp-tailwindcss/lynx": patch
---

修复 Lynx 编码时因 Tailwind 默认变量规则包含 `::backdrop` 而整组丢失的问题，保留边框、阴影等 utility 依赖的默认值和动态覆写；补齐默认过渡和等宽字体主题值的静态化，并保守保留局部、条件覆写及无法完整解析的主题别名。
