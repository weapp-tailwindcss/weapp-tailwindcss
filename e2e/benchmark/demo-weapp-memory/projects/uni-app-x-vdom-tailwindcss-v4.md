# uni-app-x-vdom-tailwindcss-v4 微信小程序端内存报告

- framework: uni-app-x
- builder: hbuilderx
- tailwindcss: v4
- source_shape: uvue
- platform: mp-weixin
- status: skipped

## 阶段汇总

| stage | status | samples | baseline RSS | peak RSS | RSS delta | max process RSS | peak processes | duration | command |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| build | skipped | 0 | 0MB | 0MB | 0MB | 0MB | 0 | 0s | uni-app x 产物依赖本机 HBuilderX 与微信/Android/iOS/Harmony SDK，普通 CI 不默认执行。 |
| hmr | skipped | 0 | 0MB | 0MB | 0MB | 0MB | 0 | 0s | uni-app x 产物依赖本机 HBuilderX 与微信/Android/iOS/Harmony SDK，普通 CI 不默认执行。 |

## 优化建议

- 该 demo 依赖 HBuilderX，本机环境下建议单独记录 IDE 进程 RSS；本脚本只统计当前命令进程树，IDE 外部常驻进程需要用系统采样补充。
- 优先用当前报告里的 peak RSS / RSS delta 锁定阶段：build 峰值高先查首轮 Tailwind 候选扫描与构建器产物缓存，HMR delta 高先查 watch 生命周期缓存是否持续增长。
- 打开 WEAPP_TW_HMR_MEMORY_DEBUG=1 后，对照 HMR raw report 中的 memory debug / plugin process samples，优先定位 heapUsedMb 或单个插件阶段 RSS 峰值最高的 bundler phase。
- 检查 weapp-tailwindcss 配置是否把 content/@source 扫描范围放大到 dist、node_modules、unpackage 或跨 demo 目录；微信端只保留真实源码和必要分包入口。
- 对 v4 demo 优先确认 Tailwind CSS 入口发现是否复用构建图缓存，避免每次热更新重新解析全部 CSS entry；对 v3 demo 优先确认 classNameSet 没有被 vendor 普通字符串放大。
- HMR 阶段如果 peak process count 异常偏高，先收敛框架 dev server 子进程和 IDE/CLI 自动打开逻辑，再比较单进程 max RSS 与总 RSS 的差异。
