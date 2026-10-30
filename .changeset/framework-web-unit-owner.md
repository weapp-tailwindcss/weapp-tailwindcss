---
"weapp-tailwindcss": patch
"@weapp-tailwindcss/postcss": patch
---

Web 生成链在真实框架 PostCSS 处理后才执行通用 rpx 兜底，使 Taro H5 等链路遵循自身配置的尺寸基数，避免提前按默认基数转换而导致样式放大与重复。保留显式单位转换只执行一次，并继续覆盖无单位插件、裸 Webpack、完整资产和框架重放场景。
