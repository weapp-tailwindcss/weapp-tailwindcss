---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1256
baseline: bc42340685067d13e0ddc665197662848faaacfa
regressions:
  - benchmark/performance/demo/test/failure-evidence.test.mjs
  - benchmark/performance/demo/test/entry-report.test.mjs
  - benchmark/performance/demo/test/memory-drain.test.mjs
  - benchmark/performance/demo/test/runtime-dependency.test.mjs
  - benchmark/performance/demo/test/source-artifact-identity.test.mjs
---

# 安装依赖与入口加载成本

## 症状

用户希望区分安装、入口加载、首次生成和框架编译的成本。PostCSS 包声明了 `es-toolkit`，但源码、声明及打包 JS 都没有消费它。根开发工具仍有真实用途，不能删除共享 catalog 或全仓依赖。

前一轮代表 demo 的测量还出现短进程 RSS 缺样本、Webpack/Taro 连续保存后 marker 未到达的问题。失败记录继续保留在上一份复盘中，不能因为后来一次通过而覆盖。

## 根因与纠正

仅移除 `packages/postcss/package.json` 的生产依赖。独立项目安装完整内部 tarball 闭包，不使用 workspace 链接；外部依赖版本与 integrity 逐项比较，只允许显式列出的确切包版本新增或移除。未声明变化、范围版本以及已有版本的 integrity 改变仍失败。还逐项比较锁文件 snapshots 中的实际解析关系，避免包列表不变但调用方切换版本被漏检；内部 tarball 路径和显式升级的 peer 身份按实验边界规范化。源码实验可显式指定 registry，并在报告中记录，避免把镜像准备过程解释为 npm 官方下载速度。

短进程退出时，已发出的 `ps` 内存采样可能还没有返回。现在等待该次采样回收后读取 RSS，耗时仍取进程退出时刻。回归先在旧实现失败，再在新实现通过。这只修复丢失已发出的采样，250 ms 轮询仍不是操作系统提供的精确进程树峰值，也不能保证任意短命进程都有有效 RSS。

隔离消费项目此前移除了 `packageManager`，导致仓库使用 pnpm 12.6.0、消费项目却使用机器默认的 12.8.1。三组现在保留仓库确切包管理器版本；旧报告仍保留原版本，不与新口径拼接。

连续更新失败过去只保留 watcher 日志与此前成功的语义快照，临时消费项目清理后无法复核失败当刻的源码和 JS。补充的失败证据保存会在 watcher 退出后归档本轮模式、阶段、操作、marker、日志偏移、实际输入和完整输出（含 JS），缺失文件单独记录错误。保存不改变失败状态，不参与成功样本计时，也不通过触发额外构建恢复 marker。此前已经清理的失败现场无法补造，仍按缺证记录；新增保存逻辑不能当作 watcher 问题已修复。

## 验证

环境：macOS arm64、Apple M4 Max、Node 24.18.0、pnpm 12.6.0。被测为源码打包产物，不是 npm 稳定版周报。基线来自合并 #1256 后的主分支；比较组仅移除未使用的依赖，运行时 JS 相同。

最小独立消费项目安装 `weapp-tailwindcss`、PostCSS 包和相同确切版本的 Tailwind。两批采用相反的版本顺序，每批离线重装 7 轮，每个入口及 ESM/CJS 组合使用 7 个新 Node 进程。样本串行，profile 单独执行。OS 文件缓存保持温热，不代表机器冷启动。

| 安装指标 | 优化前 | 优化后 | 差值 |
| --- | --- | --- | --- |
| 锁文件包数量（含可选平台包） | 256 | 255 | -1 |
| 本机安装包实例 | 217 | 216 | -1 |
| node_modules 文件内容总量 | 54,396,629 B | 50,164,368 B | -4,232,261 B |
| 移除依赖的下载归档 | 515,327 B | 无 | -515,327 B |

空间按文件内容大小统计、忽略符号链接并对硬链接去重，不等同于 APFS 物理块或全机共享 store 占用。归档通过 HTTPS npmmirror 获取并核对 SHA-512 integrity，与锁文件一致；不声称 npm 官方网络安装提速比例。若项目的其他依赖也需要 es-toolkit，实际空间收益会减少或消失。

三个代表 demo 的独立消费锁文件也完成了包完整性与解析关系复核：Vue Vite 的接入组锁包数量为 347→346，React Webpack 为 669→668，Taro 分包为 2168→2167；三者均不再包含 es-toolkit。它们不是本机安装实例数，不能与上表的 217→216 混用。

| 离线重装批次 | 优化前 median / p95 ms | 优化后 median / p95 ms | median 差值 |
| --- | --- | --- | --- |
| 1 | 354.65 / 391.35 | 281.67 / 326.23 | -72.98 ms / -20.58% |
| 2 | 390.12 / 411.76 | 322.87 / 330.90 | -67.26 ms / -17.24% |

两批进程树 RSS median 分别为 109.30→103.80 MiB、107.81→103.00 MiB。这里不是同一 demo 的完整安装实验，不能将该比例直接套用到已有大型 Taro/uni-app 项目。

入口加载没有一致的优化收益。两批合计 14 个新进程的加载 median 如下；初始化、首次生成、首次转换和全程耗时均在 JSON 中独立保存，首次转换还断言自定义 PostCSS 插件被执行。

| 入口 | ESM 前→后 ms | CJS 前→后 ms |
| --- | --- | --- |
| 根入口 | 314.65→318.60 | 226.38→231.93 |
| Vite | 211.88→210.62 | 205.57→204.60 |
| Webpack | 192.59→196.93 | 185.02→186.39 |
| PostCSS | 133.06→132.61 | 130.60→130.54 |

独立 Vite ESM CPU profile 的叶帧采样包含模块加载器、Browserslist、Autoprefixer 和 preset-env。一次样本中 Browserslist 约 23.75 ms、Autoprefixer prefixes 约 9.00 ms、preset-env 约 7.46 ms。这些采样不能相加推导框架提速，也不能证明延迟加载后首次使用成本消失。当前 StyleHandler 已在首次内容到达时才创建管线；同步 getPipeline、默认兼容转换和 Babel 回退都仍需保留。本轮不提交未被端到端收益支持的生产懒加载改动。

复现入口：

```sh
pnpm --filter weapp-tailwindcss... run build
node benchmark/performance/scripts/source-generation/pack.mjs --source <提交> --out-dir .tmp/entry-cost/<版本>
node benchmark/performance/scripts/source-generation/entry-cost.mjs --before <基线清单> --after <比较清单> --dependency-changes <确切变更JSON> --out-dir .tmp/entry-cost/entry-samples
```

独立 profiling 使用相同命令另加 `--profile`，输出到独立目录。本地官方 registry 存在 TLS 主机名验证失败，实验显式使用 `--registry https://registry.npmmirror.com`，没有关闭证书验证。完整原始样本、锁文件、安装日志、profile 与 tarball 身份保存在忽略目录 `.tmp/entry-cost/`。

本地定向验证：性能工具 33 文件 / 113 项通过；确认顺序、依赖图与失败证据三文件 10 项定向复核通过；PostCSS 自定义插件、来源、所有权、颜色和构建配置 15 项通过；主包运行时闭包构建通过；架构和规则检查通过。新增入口脚本显式执行 `eslint --no-ignore`，避免根配置忽略 benchmark 造成虚假的 lint 通过。`pnpm release status` 及镜像重试均被 registry 连接拒绝阻断，未宣称发布计划检查通过。

## 代表 demo 两批源码对照

三组共用外部依赖版本；每个版本重新预生成 static 输入。构建和启动每组 7 轮，HMR 每组预热 2 轮、采样 20 轮，第二批反转版本与组顺序。以下为正常接入组的源码产物对照，时间单位 ms，RSS 单位 MiB；各单元格为 median / p95。前后运行时 JS 相同，表中差异不自动解释为依赖移除带来的因果收益。

本次共完成 12 个目标/批次/版本组合。60 项前后场景中 46 项具备完整三组对照，14 项 Taro HMR 因不接入或静态组超时而为 N/A。完整三组样本、语义哈希、总接入与实时处理开销见 `.tmp/entry-cost/demo-samples/report.json`；失败行保留，不从报告中删除。

| 目标 | 批次 | 指标 | 优化前耗时 | 优化后耗时 | median 差值 / % | 优化前 RSS | 优化后 RSS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vue Vite Web | 1 | build.cold | 709.25 / 1108.35 | 705.77 / 1153.54 | -3.48 / -0.49% | 302.70 / 384.55 | 303.00 / 336.47 |
| Vue Vite Web | 1 | build.warm | 667.73 / 718.08 | 734.97 / 781.15 | +67.24 / +10.07% | 308.20 / 313.09 | 294.94 / 406.47 |
| Vue Vite Web | 1 | startup.page | 768.79 / 820.42 | 779.66 / 837.60 | +10.87 / +1.41% | 309.58 / 411.11 | 307.11 / 409.27 |
| Vue Vite Web | 1 | hmr.text.page | 35.51 / 165.06 | 36.00 / 164.19 | +0.49 / +1.38% | 589.14 / 637.02 | 687.85 / 726.02 |
| Vue Vite Web | 1 | hmr.replace.page | 69.71 / 166.23 | 69.55 / 75.37 | -0.16 / -0.23% | 589.24 / 637.02 | 687.85 / 726.02 |
| Vue Vite Web | 1 | hmr.add.page | 164.66 / 166.53 | 165.30 / 169.51 | +0.64 / +0.39% | 589.82 / 637.02 | 687.85 / 726.02 |
| Vue Vite Web | 1 | hmr.remove.page | 70.46 / 167.42 | 70.45 / 169.73 | -0.01 / -0.01% | 590.34 / 637.02 | 687.88 / 726.02 |
| Vue Vite Web | 1 | hmr.css.page | 133.84 / 198.51 | 123.01 / 200.96 | -10.83 / -8.09% | 590.46 / 637.02 | 687.88 / 726.02 |
| Vue Vite Web | 1 | hmr.config.page | 164.78 / 195.55 | 166.61 / 198.47 | +1.84 / +1.11% | 590.96 / 637.02 | 687.88 / 726.17 |
| Vue Vite Web | 1 | hmr.restore.page | 101.78 / 196.70 | 99.62 / 203.94 | -2.17 / -2.13% | 591.29 / 637.02 | 687.88 / 726.17 |
| Vue Vite Web | 2 | build.cold | 677.62 / 1088.02 | 692.47 / 987.14 | +14.85 / +2.19% | 306.41 / 381.12 | 305.38 / 307.33 |
| Vue Vite Web | 2 | build.warm | 683.07 / 711.39 | 684.09 / 764.64 | +1.02 / +0.15% | 305.92 / 306.66 | 306.00 / 307.44 |
| Vue Vite Web | 2 | startup.page | 796.32 / 1467.64 | 781.14 / 807.68 | -15.18 / -1.91% | 333.64 / 414.39 | 308.36 / 410.58 |
| Vue Vite Web | 2 | hmr.text.page | 36.59 / 141.92 | 36.20 / 147.43 | -0.39 / -1.07% | 575.38 / 614.83 | 571.46 / 628.84 |
| Vue Vite Web | 2 | hmr.replace.page | 71.62 / 169.82 | 71.34 / 167.26 | -0.29 / -0.40% | 575.38 / 614.89 | 571.70 / 628.92 |
| Vue Vite Web | 2 | hmr.add.page | 170.54 / 175.33 | 166.91 / 171.43 | -3.62 / -2.13% | 575.38 / 615.06 | 572.92 / 629.08 |
| Vue Vite Web | 2 | hmr.remove.page | 71.64 / 189.07 | 72.20 / 173.30 | +0.57 / +0.79% | 575.38 / 615.84 | 572.92 / 629.38 |
| Vue Vite Web | 2 | hmr.css.page | 101.74 / 211.27 | 103.99 / 202.66 | +2.25 / +2.21% | 575.38 / 618.48 | 572.92 / 631.69 |
| Vue Vite Web | 2 | hmr.config.page | 171.30 / 206.49 | 196.13 / 205.10 | +24.83 / +14.50% | 575.38 / 625.70 | 575.71 / 639.02 |
| Vue Vite Web | 2 | hmr.restore.page | 103.92 / 204.61 | 103.68 / 199.99 | -0.24 / -0.23% | 575.38 / 629.94 | 577.78 / 645.53 |
| React Webpack Web | 1 | build.cold | 1163.67 / 2175.96 | 1212.64 / 2199.69 | +48.96 / +4.21% | 466.52 / 472.09 | 457.48 / 466.47 |
| React Webpack Web | 1 | build.warm | 1212.24 / 1491.18 | 1218.39 / 1247.29 | +6.15 / +0.51% | 455.98 / 465.16 | 456.00 / 457.61 |
| React Webpack Web | 1 | startup.page | 1457.56 / 1797.44 | 1419.13 / 1801.05 | -38.42 / -2.64% | 518.77 / 522.34 | 519.31 / 530.06 |
| React Webpack Web | 1 | hmr.text.page | 211.27 / 241.65 | 219.54 / 259.87 | +8.27 / +3.92% | 937.48 / 982.08 | 927.57 / 968.86 |
| React Webpack Web | 1 | hmr.replace.page | 253.31 / 275.92 | 230.01 / 260.06 | -23.30 / -9.20% | 937.48 / 982.08 | 927.57 / 968.86 |
| React Webpack Web | 1 | hmr.add.page | 226.35 / 264.46 | 226.67 / 258.36 | +0.32 / +0.14% | 937.48 / 982.08 | 927.57 / 968.86 |
| React Webpack Web | 1 | hmr.remove.page | 239.65 / 256.02 | 228.61 / 292.06 | -11.04 / -4.61% | 937.82 / 982.08 | 927.57 / 968.86 |
| React Webpack Web | 1 | hmr.css.page | 257.12 / 292.72 | 261.11 / 290.76 | +3.99 / +1.55% | 941.03 / 982.08 | 928.17 / 968.86 |
| React Webpack Web | 1 | hmr.config.page | 260.47 / 293.85 | 257.04 / 320.02 | -3.42 / -1.31% | 943.29 / 982.08 | 929.59 / 968.86 |
| React Webpack Web | 1 | hmr.restore.page | 277.60 / 300.22 | 255.74 / 297.16 | -21.86 / -7.87% | 945.12 / 982.23 | 935.23 / 968.86 |
| React Webpack Web | 2 | build.cold | 1232.91 / 1887.17 | 1197.78 / 1833.23 | -35.12 / -2.85% | 452.80 / 458.14 | 458.53 / 472.78 |
| React Webpack Web | 2 | build.warm | 1203.36 / 1280.27 | 1196.87 / 1263.47 | -6.49 / -0.54% | 458.83 / 481.92 | 459.53 / 468.23 |
| React Webpack Web | 2 | startup.page | 1416.98 / 1492.90 | 1416.85 / 1475.67 | -0.13 / -0.01% | 520.62 / 522.16 | 520.64 / 536.75 |
| React Webpack Web | 2 | hmr.text.page | 225.24 / 254.05 | 219.91 / 254.10 | -5.33 / -2.36% | 924.38 / 966.62 | 923.12 / 969.91 |
| React Webpack Web | 2 | hmr.replace.page | 234.55 / 287.37 | 229.83 / 288.47 | -4.73 / -2.02% | 924.38 / 966.62 | 923.12 / 969.91 |
| React Webpack Web | 2 | hmr.add.page | 228.58 / 275.02 | 244.72 / 280.26 | +16.14 / +7.06% | 924.38 / 966.62 | 923.12 / 969.91 |
| React Webpack Web | 2 | hmr.remove.page | 227.40 / 292.08 | 233.02 / 262.87 | +5.63 / +2.47% | 924.60 / 966.62 | 923.12 / 969.91 |
| React Webpack Web | 2 | hmr.css.page | 271.68 / 322.70 | 259.63 / 298.79 | -12.05 / -4.44% | 925.77 / 966.62 | 924.04 / 969.91 |
| React Webpack Web | 2 | hmr.config.page | 256.76 / 292.21 | 252.24 / 284.17 | -4.53 / -1.76% | 926.85 / 966.62 | 925.02 / 969.91 |
| React Webpack Web | 2 | hmr.restore.page | 279.26 / 313.57 | 268.71 / 326.07 | -10.55 / -3.78% | 928.77 / 967.83 | 929.08 / 970.03 |
| Taro Webpack 分包 | 1 | build.cold | 6096.40 / 6779.07 | 6165.63 / 7076.52 | +69.23 / +1.14% | 1075.59 / 1133.17 | 1067.06 / 1131.50 |
| Taro Webpack 分包 | 1 | build.warm | 6011.68 / 6207.45 | 6189.53 / 10231.51 | +177.86 / +2.96% | 1070.06 / 1169.47 | 1085.64 / 1158.08 |
| Taro Webpack 分包 | 1 | startup.artifact | 3446.51 / 4137.53 | 2955.05 / 3911.21 | -491.47 / -14.26% | 694.59 / 742.41 | 691.48 / 743.02 |
| Taro Webpack 分包 | 1 | hmr.text.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 1 | hmr.replace.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 1 | hmr.add.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 1 | hmr.remove.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 1 | hmr.css.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 1 | hmr.config.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 1 | hmr.restore.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 2 | build.cold | 5820.07 / 6878.19 | 6350.43 / 7767.93 | +530.36 / +9.11% | 1079.86 / 1169.55 | 1085.58 / 1197.58 |
| Taro Webpack 分包 | 2 | build.warm | 5195.33 / 6059.58 | 5830.02 / 5949.42 | +634.69 / +12.22% | 1091.53 / 1133.17 | 1077.03 / 1128.48 |
| Taro Webpack 分包 | 2 | startup.artifact | 3341.77 / 3398.13 | 2590.88 / 3467.30 | -750.89 / -22.47% | 689.20 / 727.30 | 686.86 / 699.59 |
| Taro Webpack 分包 | 2 | hmr.text.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 2 | hmr.replace.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 2 | hmr.add.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 2 | hmr.remove.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 2 | hmr.css.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 2 | hmr.config.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |
| Taro Webpack 分包 | 2 | hmr.restore.artifact | N/A | N/A | N/A（对照缺样本） | N/A | N/A |

首次统计候选为 Vue 首批 HMR 累计 RSS，以及 Taro 第二批冷构建总耗时（+530.36 ms / +9.11%，符号检验 p=0.0078125）。后者相对 static 的处理开销没有触发相同门槛；不以整体平均抵消该目标异常。Vue 的唯一一次反向完整确认已完成，三组全部样本和语义校验通过，总耗时、实时处理开销及 RSS 均未再次触发既有门槛。首批 RSS 候选未获重复确认，原样本仍保留在主报告中；不删除失败、不调整预算，也不将单次通过解释为所有内存场景都已验证。Taro 唯一一次反向完整确认于 2026-09-30 16:29 UTC 结束，构建／启动有效，HMR 因两个对照组更新失联而失败。冷构建 +335.18 ms / +5.51%，符号检验 p=0.2265625，未达到重复确认所需统计条件；不能因此宣称稳定改善。确认批新增启动总耗时候选 +404.87 ms / +11.75%，p=0.0078125，而相对静态组开销为 +13.07 ms / +1.24%，p=0.5。保留该不确定项并单独诊断，不追加第二次性能确认或据此放宽预算。

RSS 为 250 ms 轮询得到的进程树采样峰值。HMR 同一 watcher 的累计峰值具有相关性，不能将 20 个累计值当成 20 个独立进程实验；短进程还可能漏掉子进程峰值。因此保留原始数值和限制，不将其解释为精确的操作系统峰值内存。

### Vue 唯一反向确认

下表保留确认批次的全部场景；耗时单位 ms、RSS 单位 MiB，格式为 median / p95。原始数据位于 `.tmp/entry-cost/demo-confirmation/report.json`，未与首次两批合并平均。

| 指标 | 优化前耗时 | 优化后耗时 | 优化前 RSS | 优化后 RSS |
| --- | --- | --- | --- | --- |
| build.cold | 694.79 / 1122.93 | 677.35 / 744.18 | 305.81 / 356.25 | 306.22 / 308.06 |
| build.warm | 697.03 / 746.77 | 701.97 / 802.63 | 304.98 / 306.45 | 305.64 / 396.20 |
| startup.page | 777.42 / 811.95 | 768.72 / 812.72 | 311.59 / 412.67 | 312.95 / 408.95 |
| hmr.text.page | 36.07 / 170.33 | 35.79 / 134.02 | 691.84 / 729.88 | 559.02 / 634.58 |
| hmr.replace.page | 71.24 / 168.58 | 71.19 / 72.29 | 691.84 / 729.89 | 559.02 / 634.59 |
| hmr.add.page | 168.58 / 171.34 | 169.88 / 173.45 | 691.84 / 729.98 | 559.05 / 634.67 |
| hmr.remove.page | 71.82 / 170.63 | 70.93 / 172.29 | 691.84 / 730.03 | 559.09 / 634.72 |
| hmr.css.page | 101.90 / 201.22 | 101.63 / 167.11 | 691.84 / 730.11 | 559.09 / 634.77 |
| hmr.config.page | 168.45 / 203.80 | 170.09 / 202.40 | 691.89 / 730.17 | 559.09 / 639.06 |
| hmr.restore.page | 102.42 / 200.08 | 104.75 / 201.25 | 691.89 / 730.17 | 559.09 / 644.92 |

### Taro 唯一反向确认

完整原始报告位于 `.tmp/entry-cost/taro-confirmation/report.json`，统计见同目录 `analysis.json`。前后各三组构建和启动均有 7 轮，样式语义一致；HMR 缺样本，保留 N/A。表中格式为 median / p95，耗时单位 ms，RSS 单位 MiB。

| 指标 | 优化前耗时 | 优化后耗时 | median 差值 / % | 优化前 RSS | 优化后 RSS |
| --- | --- | --- | --- | --- | --- |
| build.cold | 6080.21 / 6996.40 | 6415.39 / 7590.13 | +335.18 / +5.51% | 1095.16 / 1173.95 | 1072.41 / 1114.81 |
| build.warm | 6123.14 / 6249.74 | 6377.08 / 7358.86 | +253.94 / +4.15% | 1090.41 / 1183.44 | 1126.52 / 1193.69 |
| startup.artifact | 3445.22 / 5025.67 | 3850.09 / 7307.42 | +404.87 / +11.75% | 688.02 / 733.89 | 696.70 / 728.45 |
| hmr.text.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.replace.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.add.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.remove.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.css.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.config.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.restore.artifact | N/A | N/A | N/A | N/A | N/A |

### Taro 监听链路定向诊断

正式采样结束后，使用同一份静态消费项目单独记录保存、Webpack invalid/watchRun/compile/done 和原生文件事件，不将插桩耗时计入性能结果。第一次诊断连续验证 176 次保存后，在第 177 次保存失联：源码 inode、mtime 已变，但没有新的 Webpack invalid 或编译。第二次补录递归祖先原生监听，并使用正式采样同格式的 UUID marker，连续验证 75 次保存后失联；此时项目根目录的原生 fs.watch、Watchpack DirectoryWatcher、Webpack invalid 均没有后续目标事件，源码新 marker 未进入产物。两次都在未加载插件的静态组复现。

原始记录为 `.tmp/entry-cost/watcher-trace` 和 `.tmp/entry-cost/watcher-trace-native` 下的 `trace.jsonl`、`result.json` 与 `failed/manifest.json`。失联位于本次观察到的插件处理之前，不支持将它归因为本 PR 的依赖移除。另一个不加载 Taro 的小目录原生监听程序完成 336 次原子替换，直接与递归监听均收到事件；因此尚不能把问题扩大为所有 Node/macOS fs.watch 都失效，复杂项目监听与系统事件的具体原因仍待定位。没有用增大等待、重构建或放宽 marker 断言消除失败。

同时修复现有原生监听诊断器的两个盲区：Watchpack 使用返回值的 `.on('change')`，旧实现只包裹 callback 参数；递归项目根监听也不在原来“文件或直属父目录”的匹配范围。新增回归先在旧实现失败，再验证递归祖先、URL 路径、Buffer 文件名、EventEmitter 注册、关闭生命周期、调用方事件保持及无关文件过滤。`CI=1 pnpm test:demo:matrix native-watch-diagnostic` 两项通过，诊断器与测试 lint 通过。该诊断器仅显式 preload 时启用，不改变正常构建或性能计时。

## 适用边界

代表 demo 的两批三组测量单独保存，不使用入口微基准替代真实构建或 HMR。此前 marker 失联的诊断仍按失败报告：相同基线 tarball 的四批诊断中，Webpack 四批通过；Taro 第一批接入组在恢复文本状态时，源码已是新 marker、输出 JS 仍是旧 marker，另三批通过。不能用后三批覆盖首次失败，也不据此提交推测性的缓存修补。

正式测量中，Taro 第一批优化后的静态组在连续更新时未观察到本轮编译完成，七种 HMR 指标因此缺样本并标记失败；该批接入组未执行。第二批优化前的不接入组也出现同类超时，该批接入组、静态组已有完整样本，但三组整体对照仍不完整。不能据此计算两批 HMR 收益，也不能归因为 weapp-tailwindcss 接入组回归。Vue 首批 HMR 的进程树累计 RSS 越过既有门槛，第二批未复现，保留一次完整反向确认。确认同时反转疑似退化所在批次的前后版本顺序和三组轮换方向；不能把同一 watcher 的七个操作当成七次独立的内存实验。

2026-09-30 16:19 UTC，Taro 唯一确认的优化前静态组再次在作者 CSS 更新第 6 轮超时。此次保留了 68 个输入／产物文件：源码和 CSS 均含本轮 marker，输入宽度为 43rpx，而页面 JS 仍含上一轮 marker、输出 CSS 宽度仍为 41rpx。日志在保存前后的长度完全相同，保存后没有新的编译事件；因此问题不只是完成日志匹配失败。接入组尚未执行，不能归因为插件回归，也不能把七个失败指标当成七次独立故障。同一确认批中，优化后的不接入组在新增类第 9 轮也发生保存后日志不再增长、JS 产物仍为旧 marker 的问题，完整现场另行保留；两边接入组均未执行。该确认批的 HMR 收益不可计算，保留失败，不追加第二次性能确认；待串行采样结束后单独定位源码替换与 watcher 事件链路。

未修改 demo 源码、默认样式语义、用户配置 API 或性能预算。每次源码实验准备都重新生成并归档 static 输入，计时阶段仅验证。没有执行本地全端预检或全面验收，不能宣称 Windows/Linux、IDE、设备及全部 CLI 目标已完成。

## 规则评估

不新增 AGENTS 规则。使用可执行回归约束异步采样回收、包管理器固定和依赖实验范围；继续区分微基准、源码 tarball 与 npm 发布版周报。


### 2026-10-01：整合主线后定向重验

整合主线 `0bfb23912` 的 escape workspace 迁移，无文本冲突。锁文件相对新主线仍仅移除 PostCSS 的 es-toolkit importer 依赖；原安装与性能数字属于报告记录的旧实验基线，本轮没有重采样或更新这些数字。

本轮 `CI=1 pnpm install --frozen-lockfile --offline`、escape 构建与 120 项测试、核心自定义映射/CI 与打包契约 57 项、性能工具 113 项、native watch 诊断 2 项、`pnpm --filter weapp-tailwindcss... run build`、架构和规则检查均通过。

用户要求同步 main 后重新验证，因此对新整合树串行运行一次 `CI=1 DEMO_MATRIX_PROCESS_DIAGNOSTICS=1 DEMO_MATRIX_WATCH_DIAGNOSTICS=1 DEMO_MATRIX_ARTIFACT_DIR=.tmp/main-sync-weapp-macos pnpm e2e:demo:matrix weapp-vite-tailwindcss-v4:weapp`：生产构建、initial/replace/add/restore 均通过，日志和产物保存在对应 artifact 目录。没有修改 demo 源码或 static 基线，没有重跑已耗尽的正式性能采样。

此单组通过不证明此前 macOS 原生监听丢事件缺陷已修复；上游监听实现没有变化，原始失败和连续保存失败证据继续有效。远端应验证新 head，本地定向结果不代替 Node 22 hosted CI、连续事件可靠性或全端设备验收。规则未变更。
