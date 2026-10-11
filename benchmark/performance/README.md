# 性能证据的范围

`report` 的 postcss/core/runtime 是微基准。synthetic HMR 调用模板转换，bundler 场景调用普通 esbuild，均不能代替实际插件的 watch 证据。

runtime 场景分别创建 cn 与 tailwind-merge 的真实实例：cold 包含引擎和包装初始化，cache-miss 保持实例并改变最终被覆盖的输入，cache-hit 重复输入，custom-map 验证自定义映射，hot-churn 混合热点与大量冷输入。最终输出必须稳定且满足冲突消解语义。

## 真实 watcher

运行 `pnpm --filter benchmark-performance watch:report`，默认 Vite/Webpack 各覆盖 10、50、100 个来源片段，预热 2 次、采样 7 次。每个规模只建立一个 watcher；显式设置 `generator.hmr.preserveDeletedCss: false`；每轮依次新增候选、删除一个入口的作者样式、修改配置，再逐项恢复初始状态。临时根目录先通过 realpath 固定身份，两个 CSS 入口始终保留；只从本轮 bundler 资产图采样，恢复后的输出哈希必须一致。

支持 `--source-root` 指向已安装并构建的独立基线工作树，以及 `--output` 指定报告路径。比较时使用同一份基准脚本，两个工作树各自解析自己的插件与依赖，串行测量，报告记录 SHA、工作树状态、Node、CPU、median、p95、RSS 和 GC 后堆占用。报告写入忽略目录，不自动更新预算。

这项验证覆盖构建器真实 watch 产物，不包含浏览器渲染、IDE 或设备。设备验收仍执行仓库的环境预检与多端流程。

## 静态基线

`pnpm --filter benchmark-performance watch:baseline` 单独生成 3 个来源片段的 Vite/Webpack CSS 基线，写入 `test/fixtures/watch/`。普通测试只读取这些基线，仍要求连续三轮恢复后的完整输出一致。更新后需运行 `pnpm --filter benchmark-performance test -- --update=none` 验证，不能以更新基线掩盖动态内容残留。
