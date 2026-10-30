---
"weapp-tailwindcss": patch
"@weapp-tailwindcss/postcss": patch
---

Web 生成链在真实框架 PostCSS 处理后才执行通用 rpx 兜底，使 Taro H5 等链路遵循自身配置的尺寸基数，避免提前按默认基数转换而导致样式放大与重复。保留显式单位转换只执行一次，并继续覆盖无单位插件、裸 Webpack、完整资产和框架重放场景。

区分 Web 模块的生成缓存与真实框架产物，仅在框架处理后登记可重放样式，避免 uni-app App 等改名输出被旧 rpx 规则再次覆盖。

将 Generic Web 快路径的模块生成状态与最终 CSS 资产登记分离，保留真实 PostCSS 输出、准确更新回调和用户 matcher；独立入口的样式只沿构建图消费，默认不再按根目录位置删除其他 Web 入口的规则，保留框架显式声明的 App WebView 策略。 正确解码二进制 UTF-8 CSS 资产，保留非 ASCII 作者内容。
