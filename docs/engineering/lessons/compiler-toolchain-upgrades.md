---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1256
baseline: bc42340685067d13e0ddc665197662848faaacfa
regressions:
  - packages/postcss/test/rolldown-build-contract.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-upgrade-contract.test.ts
  - scripts/ci/demo-matrix/rollup-invalidation.test.mjs
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
  - benchmark/version-compare/test/process-memory.test.mjs
  - packages/weapp-tailwindcss/test/bundlers/vite-root-coverage-reuse.test.ts
  - packages/postcss/test/css-rule-matcher.test.ts
---

# 编译依赖的逐项升级验证

## 症状

评估 Oxc 0.152.0、Rollup 4.63.5、Rolldown 1.2.11 的兼容性和稳定性，不进行全仓 latest 更新，也不把版本号变化解释为性能收益。

## 根因与纠正

Oxc parser 从 0.151.0 升至 0.152.0，保留其他调用方的旧版本。官方[发布说明](https://github.com/oxc-project/oxc/releases/tag/crates_v0.152.0)包含解析修复。新增中文与非 BMP 字符之后的 TSX/模板位置、精确 classNameSet 以及首次 source map 回退契约；需要映射时仍由 Babel 处理。

根开发依赖 Rollup 从 4.63.0 升至 4.63.5，框架依赖的 3.30.0、4.63.0、4.63.1 保留。[上游发布说明](https://github.com/rollup/rollup/releases/tag/v4.63.5)中的 watch 修复未覆盖全部现有回归：未打补丁的确切候选版本 18 项中有 6 项失败，涉及同一 throttle 窗口的新文件状态和构建期间的 transform dependency 失效。候选版本入口可通过 WEAPP_TW_ROLLUP_CANDIDATE 显式指定，普通 CI 仍使用框架实际解析版本。

因此保留补丁并迁移到 4.63.5 的确切源码。旧补丁能在宽松应用实验中成功，但 pnpm 严格应用拒绝第三个 hunk，不能直接复制旧文件作为交付。重新生成上下文后 frozen install 和相同 18 项回归通过。只有未补丁版本通过完整 watcher 回归后才移除；不降低断言或调整 watcher 等待来接受升级。

Rolldown 仅通过 `tsdown@0.23.0>rolldown: 1.2.11` 在调用方允许的 `~1.2.7` 范围内升级，保留其他框架版本。官方[发布说明](https://github.com/rolldown/rolldown/releases/tag/v1.2.11)包含 sourcemap names 和 watcher 事件修复，但没有声称修复本仓库的 CJS 多入口 panic。将语法入口重新并入 CJS 主构建后，1.2.7 与 1.2.11 均在 `generator.rs:111:52` 报 `no entry found for key`，所以保留独立语法入口构建。新增真实全入口产物回归；只有两个格式的产物和实现分块映射均通过才接受升级。纯重导出入口允许没有自己的 map，不误判为丢失源码映射。

## 验证

Node 24.18.0、pnpm 12.6.0、macOS arm64。Oxc、Rolldown 要求 Node ^20.19.0 或 >=22.12.0，符合当前工具链。官方 registry 本机 TLS 主机名校验失败，使用 HTTPS npmmirror 下载，保留 package integrity；没有禁用 TLS。

- Oxc 升级后主包闭包构建通过；JS/Babel 定向测试 288 项通过、2 项条件跳过；新增映射与 Unicode 契约 2 项通过。
- Rollup 未补丁候选：12 通过、6 失败。迁移补丁后的实际根依赖：18 通过；frozen install 通过。
- Rolldown 1.2.11 的 frozen install、主包完整运行时闭包构建（含声明）通过；真实多入口、ESM/CJS 映射、颜色 parser 隔离、自定义插件及来源信息 11 项通过。无绕行的 panic 实验前后均失败，日志保留。
- 曾因新 worktree 尚未构建内部 exports、以及候选副本未链接 native 运行时导致实验失败，日志保留；它们是实验准备问题，不能当作产品兼容回归。

复现候选版本回归：

```sh
pnpm install --frozen-lockfile
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/js test/babel --update=none
CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-invalidation.test.mjs scripts/ci/demo-matrix/rollup-watch.test.mjs --update=none
```

单独候选安装目录通过环境变量 WEAPP_TW_ROLLUP_CANDIDATE 传入；必须为绝对路径且解析到 4.63.5。原始发布元数据、锁文件与失败/成功日志保存在 .tmp/toolchain-evidence。

### 源码产物性能实验（主采样与唯一确认已结束，诊断未完成）

源码 tarball 对照固定外部依赖，仅允许清单中 Oxc 及其必要依赖从 0.151.0 变为 0.152.0；Rollup 和 Rolldown 用于构建被测 tarball，没有强制替换 demo 的框架依赖。消费项目同时校验包完整性和实际锁文件解析边。两批采用相反顺序，构建和启动各 7 轮，HMR 预热 2 轮后每种操作 20 轮；三组在同一机器上串行运行。

2026-09-30 15:54 UTC，三个目标的两批三组主采样全部完成，120 个版本／场景记录均有完整样本且语义通过，共 60 个前后场景可比较。Vue 和 Taro 出现以下待确认项，沿用现有统计与绝对／相对双门槛，不据此宣称升级提速：

| 批次／指标 | 升级前 median | 升级后 median | 差值 | 比例 | 配对符号概率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vue 第一批冷构建，正常接入总耗时 | 685.26 ms | 804.38 ms | +119.12 ms | +17.38% | 0.0078125 |
| Vue 第二批热构建，接入减静态组的 RSS | 93.86 MiB | 306.02 MiB | +212.16 MiB | +226.04% | 0.0078125 |
| Taro 第一批冷构建，正常接入总耗时 | 5730.63 ms | 6075.35 ms | +344.72 ms | +6.02% | 0.0078125 |
| Taro 第一批热构建，正常接入总耗时 | 4884.83 ms | 5821.44 ms | +936.60 ms | +19.17% | 0.0078125 |
| Taro 第一批启动，正常接入总耗时 | 2674.86 ms | 3494.80 ms | +819.94 ms | +30.65% | 0.0078125 |
| Taro 第二批作者 CSS 更新，接入减静态组的耗时 | 381.10 ms | 400.44 ms | +19.35 ms | +5.08% | 0.005909 |

原始数据保存在 `.tmp/toolchain-evidence/demo-samples/report.json`，统计结果为同目录 `analysis.json`。RSS 每 250 ms 轮询进程树，可能漏掉短命子进程峰值；差值不能解释为精确独占内存。这些候选需要进一步确认，不能直接归因于产品或环境噪声。

Vue 唯一完整反向确认于 2026-09-30 16:42 UTC 完成，输出 `.tmp/toolchain-evidence/vue-confirmation`，顺序与首个冷构建候选所在第一批相反，同时复核第二批 RSS 候选。所有三组样本和语义通过。冷构建总耗时仍增加 457.07 ms / 49.62%，但配对符号概率为 0.0625，未满足既有统计确认条件；不能据此宣称没有退化。热构建相对静态组 RSS 候选没有再次触发门槛。新增作者 CSS 更新与恢复两个总耗时候选，见下表；原始样本全部保留，不追加第二次完整确认，不将未确认项直接解释为环境噪声。

Taro 唯一完整反向确认于 17:20 UTC 结束，输出 `.tmp/toolchain-evidence/taro-confirmation`。冷／热构建与启动三项样本、语义完整，原总耗时候选没有再次满足门槛；不能把本批反向差值标注为升级收益。两个版本的静态组均发生 marker 失联，7 个 HMR 前后场景全部为 N/A，第二批作者 CSS 开销候选仍无法完成确认。失败现场和原始样本全部保留，不再追加完整性能复测。这与安装 PR 自身的 Taro 确认使用不同 after tarball、不同输出目录，结果不能互相替代。

<!-- source-comparison-table:start -->
### 三个目标的两批源码对照

下表为正常接入组的前后对照，各数值为 median / p95，时间单位 ms、RSS 单位 MiB。React 两批的总量及相对静态组开销均未触发既有统计门槛；这不等于已证明升级提速。

| 目标 | 批次 | 指标 | 升级前耗时 | 升级后耗时 | median 差值 / % | 升级前 RSS | 升级后 RSS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vue Vite Web | 1 | build.cold | 685.26 / 774.77 | 804.38 / 1056.96 | +119.12 / +17.38% | 305.50 / 403.34 | 304.39 / 395.50 |
| Vue Vite Web | 1 | build.warm | 695.40 / 709.02 | 701.43 / 809.59 | +6.03 / +0.87% | 304.61 / 306.41 | 305.91 / 405.78 |
| Vue Vite Web | 1 | startup.page | 785.01 / 800.99 | 772.88 / 784.35 | -12.12 / -1.54% | 310.56 / 410.45 | 310.73 / 316.73 |
| Vue Vite Web | 1 | hmr.text.page | 36.45 / 163.15 | 36.41 / 167.51 | -0.04 / -0.12% | 667.14 / 704.20 | 698.23 / 735.20 |
| Vue Vite Web | 1 | hmr.replace.page | 69.92 / 74.14 | 69.67 / 130.07 | -0.25 / -0.36% | 667.14 / 704.20 | 698.23 / 735.20 |
| Vue Vite Web | 1 | hmr.add.page | 164.83 / 176.52 | 165.56 / 171.61 | +0.72 / +0.44% | 667.14 / 704.20 | 698.34 / 735.20 |
| Vue Vite Web | 1 | hmr.remove.page | 119.96 / 180.47 | 164.50 / 168.20 | +44.54 / +37.13% | 667.14 / 704.20 | 698.34 / 735.20 |
| Vue Vite Web | 1 | hmr.css.page | 101.67 / 196.18 | 101.61 / 196.97 | -0.06 / -0.06% | 667.14 / 704.20 | 698.34 / 735.20 |
| Vue Vite Web | 1 | hmr.config.page | 164.49 / 198.52 | 165.23 / 197.93 | +0.74 / +0.45% | 667.14 / 704.20 | 698.34 / 735.20 |
| Vue Vite Web | 1 | hmr.restore.page | 102.70 / 198.59 | 100.86 / 196.84 | -1.84 / -1.79% | 667.14 / 704.22 | 698.34 / 735.20 |
| Vue Vite Web | 2 | build.cold | 774.17 / 1158.38 | 675.42 / 978.91 | -98.75 / -12.76% | 296.88 / 402.58 | 306.95 / 308.09 |
| Vue Vite Web | 2 | build.warm | 740.31 / 790.44 | 675.07 / 686.38 | -65.24 / -8.81% | 295.30 / 405.47 | 306.20 / 308.02 |
| Vue Vite Web | 2 | startup.page | 822.07 / 842.99 | 771.82 / 821.89 | -50.25 / -6.11% | 409.97 / 413.78 | 313.30 / 411.34 |
| Vue Vite Web | 2 | hmr.text.page | 36.58 / 132.48 | 35.84 / 131.87 | -0.74 / -2.03% | 560.58 / 628.27 | 588.84 / 638.42 |
| Vue Vite Web | 2 | hmr.replace.page | 69.72 / 166.04 | 69.50 / 71.43 | -0.22 / -0.31% | 560.58 / 628.27 | 589.05 / 638.42 |
| Vue Vite Web | 2 | hmr.add.page | 166.01 / 168.68 | 165.76 / 167.83 | -0.25 / -0.15% | 560.58 / 628.27 | 589.82 / 638.70 |
| Vue Vite Web | 2 | hmr.remove.page | 71.27 / 167.48 | 70.60 / 166.58 | -0.68 / -0.95% | 560.64 / 628.27 | 589.91 / 638.70 |
| Vue Vite Web | 2 | hmr.css.page | 101.57 / 196.24 | 101.74 / 195.16 | +0.17 / +0.17% | 560.74 / 628.27 | 589.95 / 638.70 |
| Vue Vite Web | 2 | hmr.config.page | 165.70 / 197.39 | 165.22 / 197.45 | -0.48 / -0.29% | 560.87 / 628.27 | 590.83 / 638.72 |
| Vue Vite Web | 2 | hmr.restore.page | 101.19 / 197.45 | 162.73 / 195.68 | +61.55 / +60.83% | 562.24 / 628.27 | 591.15 / 638.72 |
| React Webpack Web | 1 | build.cold | 1257.46 / 1901.80 | 1140.99 / 1772.55 | -116.47 / -9.26% | 456.70 / 472.23 | 460.39 / 467.89 |
| React Webpack Web | 1 | build.warm | 1259.09 / 1544.11 | 1159.03 / 1205.15 | -100.06 / -7.95% | 455.11 / 495.53 | 463.52 / 469.94 |
| React Webpack Web | 1 | startup.page | 1461.03 / 1704.72 | 1349.34 / 1545.01 | -111.69 / -7.64% | 520.64 / 532.89 | 546.73 / 550.62 |
| React Webpack Web | 1 | hmr.text.page | 204.35 / 243.11 | 211.25 / 234.61 | +6.90 / +3.38% | 927.55 / 974.45 | 931.92 / 969.72 |
| React Webpack Web | 1 | hmr.replace.page | 228.66 / 261.34 | 236.57 / 273.75 | +7.90 / +3.46% | 927.55 / 974.45 | 931.92 / 969.72 |
| React Webpack Web | 1 | hmr.add.page | 233.06 / 291.02 | 229.38 / 264.05 | -3.68 / -1.58% | 927.55 / 974.45 | 931.92 / 969.72 |
| React Webpack Web | 1 | hmr.remove.page | 221.93 / 258.04 | 229.97 / 291.84 | +8.04 / +3.62% | 928.47 / 974.45 | 931.92 / 969.72 |
| React Webpack Web | 1 | hmr.css.page | 247.58 / 286.22 | 254.16 / 295.31 | +6.57 / +2.65% | 931.39 / 974.45 | 931.92 / 969.72 |
| React Webpack Web | 1 | hmr.config.page | 249.67 / 300.96 | 263.52 / 296.64 | +13.85 / +5.55% | 932.89 / 974.45 | 931.92 / 969.72 |
| React Webpack Web | 1 | hmr.restore.page | 263.03 / 301.18 | 249.11 / 295.78 | -13.92 / -5.29% | 939.16 / 975.83 | 932.13 / 969.72 |
| React Webpack Web | 2 | build.cold | 1168.61 / 1813.40 | 1144.55 / 1703.23 | -24.06 / -2.06% | 465.72 / 487.27 | 463.95 / 476.45 |
| React Webpack Web | 2 | build.warm | 1151.39 / 1158.43 | 1140.32 / 1157.69 | -11.07 / -0.96% | 466.50 / 471.25 | 467.56 / 470.17 |
| React Webpack Web | 2 | startup.page | 1345.31 / 1434.84 | 1361.98 / 1416.68 | +16.67 / +1.24% | 547.86 / 553.45 | 539.70 / 546.34 |
| React Webpack Web | 2 | hmr.text.page | 194.18 / 246.49 | 195.95 / 238.97 | +1.78 / +0.92% | 930.17 / 974.03 | 921.04 / 968.97 |
| React Webpack Web | 2 | hmr.replace.page | 224.89 / 262.98 | 218.37 / 263.81 | -6.52 / -2.90% | 930.17 / 974.03 | 922.02 / 968.97 |
| React Webpack Web | 2 | hmr.add.page | 225.57 / 276.98 | 231.82 / 267.31 | +6.25 / +2.77% | 930.17 / 974.03 | 923.11 / 968.97 |
| React Webpack Web | 2 | hmr.remove.page | 227.38 / 263.23 | 228.64 / 257.43 | +1.26 / +0.56% | 931.25 / 974.03 | 926.09 / 968.97 |
| React Webpack Web | 2 | hmr.css.page | 248.53 / 291.22 | 248.86 / 275.68 | +0.33 / +0.13% | 933.47 / 974.03 | 927.54 / 968.97 |
| React Webpack Web | 2 | hmr.config.page | 249.95 / 294.73 | 245.13 / 294.89 | -4.82 / -1.93% | 934.94 / 974.03 | 929.08 / 969.58 |
| React Webpack Web | 2 | hmr.restore.page | 260.31 / 329.75 | 252.36 / 288.19 | -7.95 / -3.05% | 937.12 / 974.92 | 930.57 / 971.41 |
| Taro Webpack 分包 | 1 | build.cold | 5730.63 / 6184.47 | 6075.35 / 6603.42 | +344.72 / +6.02% | 1075.92 / 1157.56 | 1109.91 / 1159.17 |
| Taro Webpack 分包 | 1 | build.warm | 4884.83 / 5196.56 | 5821.44 / 6168.93 | +936.60 / +19.17% | 1085.09 / 1103.50 | 1113.17 / 1156.36 |
| Taro Webpack 分包 | 1 | startup.artifact | 2674.86 / 4327.54 | 3494.80 / 5166.72 | +819.94 / +30.65% | 693.30 / 747.22 | 694.52 / 773.20 |
| Taro Webpack 分包 | 1 | hmr.text.artifact | 713.22 / 752.26 | 702.11 / 739.29 | -11.11 / -1.56% | 1949.73 / 2021.38 | 2030.84 / 2091.75 |
| Taro Webpack 分包 | 1 | hmr.replace.artifact | 729.48 / 760.14 | 723.85 / 766.49 | -5.63 / -0.77% | 1949.73 / 2021.38 | 2032.13 / 2091.75 |
| Taro Webpack 分包 | 1 | hmr.add.artifact | 730.37 / 757.55 | 726.83 / 768.03 | -3.55 / -0.49% | 1949.73 / 2021.38 | 2033.38 / 2091.75 |
| Taro Webpack 分包 | 1 | hmr.remove.artifact | 722.05 / 768.40 | 706.67 / 752.68 | -15.38 / -2.13% | 1949.73 / 2021.38 | 2040.52 / 2091.75 |
| Taro Webpack 分包 | 1 | hmr.css.artifact | 809.97 / 846.55 | 799.66 / 814.13 | -10.30 / -1.27% | 1949.73 / 2021.38 | 2040.52 / 2091.75 |
| Taro Webpack 分包 | 1 | hmr.config.artifact | 813.61 / 845.73 | 789.47 / 837.91 | -24.14 / -2.97% | 1950.17 / 2021.38 | 2040.52 / 2091.75 |
| Taro Webpack 分包 | 1 | hmr.restore.artifact | 813.18 / 854.68 | 802.02 / 832.66 | -11.16 / -1.37% | 1951.36 / 2021.38 | 2041.38 / 2091.75 |
| Taro Webpack 分包 | 2 | build.cold | 5959.02 / 7094.10 | 5943.62 / 6509.14 | -15.40 / -0.26% | 1094.28 / 1199.66 | 1073.52 / 1115.98 |
| Taro Webpack 分包 | 2 | build.warm | 5910.55 / 6136.84 | 6028.06 / 6240.42 | +117.50 / +1.99% | 1079.80 / 1162.31 | 1089.31 / 1197.88 |
| Taro Webpack 分包 | 2 | startup.artifact | 3417.93 / 4086.39 | 3467.59 / 3781.82 | +49.66 / +1.45% | 694.50 / 705.08 | 688.44 / 703.97 |
| Taro Webpack 分包 | 2 | hmr.text.artifact | 704.93 / 733.11 | 717.19 / 750.75 | +12.26 / +1.74% | 2060.59 / 2114.17 | 1968.20 / 2044.12 |
| Taro Webpack 分包 | 2 | hmr.replace.artifact | 731.29 / 764.07 | 719.78 / 781.83 | -11.51 / -1.57% | 2061.61 / 2114.17 | 1968.20 / 2044.12 |
| Taro Webpack 分包 | 2 | hmr.add.artifact | 729.70 / 764.99 | 748.30 / 754.84 | +18.59 / +2.55% | 2062.76 / 2114.17 | 1968.20 / 2044.12 |
| Taro Webpack 分包 | 2 | hmr.remove.artifact | 730.99 / 761.88 | 724.38 / 753.48 | -6.61 / -0.90% | 2063.76 / 2114.17 | 1968.20 / 2044.12 |
| Taro Webpack 分包 | 2 | hmr.css.artifact | 800.34 / 806.30 | 811.24 / 817.46 | +10.90 / +1.36% | 2064.80 / 2114.17 | 1968.91 / 2044.12 |
| Taro Webpack 分包 | 2 | hmr.config.artifact | 799.91 / 829.46 | 812.75 / 842.64 | +12.84 / +1.61% | 2077.90 / 2114.17 | 1969.97 / 2044.12 |
| Taro Webpack 分包 | 2 | hmr.restore.artifact | 801.24 / 855.19 | 797.44 / 843.13 | -3.80 / -0.47% | 2105.28 / 2114.17 | 1971.09 / 2044.12 |
<!-- source-comparison-table:end -->

### Vue 唯一反向确认

新增作者 CSS 与恢复操作的正常接入总耗时候选分别为 +94.82 ms / +94.08%（p=0.001288）、+98.03 ms / +97.33%（p=0.005909）。相对静态组开销的绝对增量为 +31.12 ms、+12.74 ms，两者符号概率均为 0.588099，未触发处理开销门槛；其中升级前开销中位数为负数，不用负分母的百分比解释退化。需要在正式计时以外诊断页面观察、CSS 更新与实际处理的边界，不能只按版本号归因。

下表为正常接入组，格式为 median / p95，耗时单位 ms、RSS 单位 MiB。原始样本和统计分别为 `.tmp/toolchain-evidence/vue-confirmation/report.json`、`analysis.json`。

| 指标 | 升级前耗时 | 升级后耗时 | median 差值 / % | 升级前 RSS | 升级后 RSS |
| --- | --- | --- | --- | --- | --- |
| build.cold | 921.16 / 2348.77 | 1378.23 / 2310.57 | +457.07 / +49.62% | 335.50 / 376.97 | 391.38 / 396.09 |
| build.warm | 732.22 / 1104.15 | 1014.95 / 1464.54 | +282.73 / +38.61% | 299.02 / 404.75 | 307.73 / 394.42 |
| startup.page | 882.40 / 1124.85 | 870.39 / 1034.94 | -12.01 / -1.36% | 396.33 / 414.86 | 373.52 / 410.41 |
| hmr.text.page | 35.82 / 131.62 | 130.66 / 148.69 | +94.85 / +264.81% | 553.84 / 704.06 | 565.56 / 628.20 |
| hmr.replace.page | 69.51 / 88.56 | 77.55 / 227.82 | +8.03 / +11.56% | 553.88 / 704.06 | 565.57 / 628.20 |
| hmr.add.page | 165.64 / 170.91 | 166.23 / 209.18 | +0.58 / +0.35% | 555.06 / 704.06 | 565.70 / 628.20 |
| hmr.remove.page | 71.08 / 166.15 | 118.60 / 215.01 | +47.52 / +66.85% | 556.48 / 704.06 | 565.80 / 628.20 |
| hmr.css.page | 100.79 / 197.35 | 195.61 / 294.30 | +94.82 / +94.08% | 557.92 / 704.06 | 565.87 / 628.20 |
| hmr.config.page | 163.76 / 198.73 | 164.40 / 299.95 | +0.64 / +0.39% | 561.71 / 704.06 | 568.77 / 628.28 |
| hmr.restore.page | 100.72 / 194.14 | 198.75 / 248.94 | +98.03 / +97.33% | 565.23 / 704.06 | 576.26 / 628.30 |

### Taro 唯一反向确认

正常接入组，格式为 median / p95，耗时单位 ms、RSS 单位 MiB。构建／启动每组 7 轮；两版本接入组 HMR 各 20 轮，但静态组不完整，因此不单独用接入组证明公平对照通过。冷构建升级前 p95 为 32.12 s，保留该长尾，不删除离群点或将反向差值直接解释为提速。

| 指标 | 升级前耗时 | 升级后耗时 | median 差值 / % | 升级前 RSS | 升级后 RSS |
| --- | --- | --- | --- | --- | --- |
| build.cold | 8145.14 / 32118.59 | 6252.93 / 7114.55 | -1892.21 / -23.23% | 1096.05 / 1119.23 | 1095.17 / 1163.81 |
| build.warm | 7262.51 / 8451.35 | 6046.20 / 6543.54 | -1216.31 / -16.75% | 1076.56 / 1098.25 | 1086.31 / 1128.09 |
| startup.artifact | 3520.67 / 5093.11 | 3555.81 / 5043.66 | +35.14 / +1.00% | 688.53 / 741.70 | 703.97 / 734.98 |
| hmr.text.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.replace.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.add.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.remove.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.css.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.config.artifact | N/A | N/A | N/A | N/A | N/A |
| hmr.restore.artifact | N/A | N/A | N/A | N/A | N/A |

两处实际失败均发生在静态组 `text` 操作前的恢复阶段：升级后 round=19（第 20 轮），源码为 `cost-139eb1f6-8190-4824-8716-6191133d559c`，产物仍为 `cost-54c0e6f0-f7d2-4c7c-a87c-d4685df15470`；升级前 round=7（第 8 轮），源码为 `cost-fa08450d-58eb-459a-995b-3729d10801e0`，产物仍为 `cost-4b3b5aaa-2bd9-47a9-9f88-db6f147f56a6`。各自保存 68 个输入／产物文件及 manifest，位于对应版本 `confirmation/failed-watch/static`。原生组尚未执行；这不是插件样式等价通过，也不能归因为 Oxc 回归。后续应单独诊断保存事件、框架监听及编译生命周期，诊断不能混入验收计时。

### 监听失联的定位边界

正式采样结束后，在安装优化实验的静态消费项目中单独插桩，连续 176 次及 75 次保存之后各复现一次失联。第二次记录覆盖原生递归 fs.watch、Watchpack DirectoryWatcher 与 Webpack 生命周期：源码 inode/mtime 已更新，但这三层均没有新的目标事件，产物保留旧 marker。该诊断不加载插件；它说明现有 marker 失败不能直接作为 Oxc 回归证据，不替代本升级实验失败的静态样本。小目录纯原生监听的 336 次原子替换均成功，复杂项目监听根因尚未完全确定。

详细记录见安装优化报告的“Taro 监听链路定向诊断”；这两次插桩不是额外性能确认，不进入前后耗时表。Vue 页面 CSS／恢复已另行 profile，见下节；原性能候选的归因仍未确认，未宣称性能验收全部完成。

### Vue 独立 profile

2026-09-30 17:56 UTC 完成升级前／后、接入／静态四组独立诊断。重新准备源码 tarball 消费项目并验证外部依赖解析关系；每组同一 watcher 连续执行 3 轮作者 CSS 与配置恢复，同时校验本轮 marker、实际页面和样式。打开服务端生成阶段日志、Vite HMR 调试、V8 CPU profiler，并记录浏览器请求与 WebSocket 消息。四组均无语义错误。该诊断不属于正式性能采样，不能替代原候选的统计确认。

| 接入组诊断 | 升级前 | 升级后 |
| --- | --- | --- |
| 作者 CSS 保存至验证，3 次 ms | 199.63 / 192.84 / 196.61 | 228.36 / 197.16 / 99.81 |
| 配置恢复保存至验证，3 次 ms | 194.23 / 147.29 / 168.43 | 201.13 / 197.28 / 195.54 |
| 这 6 次操作中首条 HMR 消息距保存的范围 ms | 45.40–99.17 | 10.04–113.98 |
| generateCss.serve 次数，含启动与恢复 | 19 | 20 |
| 去掉首次生成后的单次生成范围 ms | 4–46 | 4–59 |

升级后同组作者 CSS 的 197.16 ms 与 99.81 ms 两次操作，首条 HMR 消息分别在 113.98 ms 与 10.04 ms 到达，差异已存在于消息之前；末次请求结束后至样式验证为 10.94 ms 与 24.75 ms。因此不能把整个约 100 ms 差值解释成浏览器断言轮询或 Oxc/Tailwind 生成 CPU。生成日志没有每次增加约 100 ms 的对应现象；19/20 次总调用差异包含启动、源码和 CSS 更新交错，不能单独认定新增了一次可删除的生成。

CPU profile 保留了模块加载、候选提取、文件读取和空闲等待，没有足够证据据此修改生产缓存、扫描范围或 watcher 策略。Vite 消费版本固定为 8.3.0，其 bundled watcher 的事件合并也需要与保存到 HMR 发出的阶段分开诊断；尚未证明具体等待来自哪一层。原候选继续标为未归因，不将本次插桩结果当作“无退化”的证明。

原始事件、4 份 Vite CPU profile 与服务日志位于 `.tmp/toolchain-evidence/vue-profile` 的 `events.json`、`complete.json` 和各版本 `profile` 目录。第一次诊断在准备目录与日志目录重名时退出，未产生计时样本；复用已经准备的消费者、将 profile 输出分目录后执行成功，没有重跑正式性能确认。

## 适用边界

稳定性升级不标注性能提升。框架旧版本没有被全局 override 强制统一。未完成本地全端预检及全矩阵验收，不宣称设备、IDE、Windows/Linux 已验证。源码 tarball 对照与 npm 稳定版周报分开记录，不更新预算。

## 规则评估

不新增 AGENTS 规则；使用持久回归和可显式选择候选版本的测试入口验证升级边界。


## 最新 head 的 CI 性能失败与独立诊断

`7108ea310a92d61abe558c97117a7159b76b92c0` 的 [Benchmark attempt 1](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36755689240/job/110025910261) 在 Taro Webpack 微信目标触发 `hmrPluginP95` 门禁：去除首轮后的插件样本为基线 `[1086, 1101]` ms、当前 `[1164, 1199]` ms，p95 增加 98 ms / 8.90%，两项样本均越过原门槛。构建、marker 更新和样本采集成功；这是待确认的性能失败，不是构建错误。

相同基线 `bc42340685067d13e0ddc665197662848faaacfa`、相同生产源码与锁文件的[上一轮 CI](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36716014352)通过，稳态插件样本分别为 `[1471, 1394]` / `[1449, 1455]` ms。两 head 仅报告文档不同；旧结果只能说明该变化尚未稳定重复，不能替代最新 head 的验收，也不能直接归因于 runner 噪声。

针对这个 CI 单一场景另做一次本地反向诊断：从上述基线和当前 head 分别导出独立消费目录，以各自 frozen lockfile 离线安装、构建所需内部包闭包，使用同一 `benchmark/version-compare/scripts/run-matrix.mjs`，按 current → base 串行采集各 3 次 build / 3 次连续 watch。准备和包构建不计时。macOS / Node 24.18.0 下，稳态插件样本为 base `[692, 705]` / current `[674, 676]` ms，原门槛评估通过；全部 marker 样本完成。此诊断与前述三组正式实验分开，不增加正式确认次数，不作为 Linux / Node 22 CI 已通过的证明。原始证据保留在 `.tmp/toolchain-evidence/ci-taro-local-reverse/`，两个云端原始 artifact 也分别保存。

云端失败的 CSS 阶段从约 560 ms 增至 581–608 ms，而 JS 阶段没有同幅度、同方向的稳定变化；未取得足以定位 Oxc 或 Rolldown 因果关系的证据，因此不提交推测性生产性能补丁、不放宽门槛、不自动更新预算。

同一 head 的 [Lynx iOS attempt 1](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36755688568/job/110025217436) 在构建安装后查询应用容器超过 30 秒。同步 #1257 已有的指定设备就绪检查及仅一次只读查询恢复，保留原始异常与 12 项定向回归；不重跑构建、安装或样式断言。见 [iOS 容器就绪记录](lynx-ios-container-readiness.md)。新的 CI 提交仍需重新验证。

### weapp-vite HMR 内存失败与采样证据补齐

`4046fd0191ec97fe4aadb70715b3239fe7c6fbfa` 的 [Benchmark attempt 1](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36760793833/job/110045463318) 在 weapp-vite 微信目标完成 marker 与构建采样，但 RSS 首次和唯一反向确认均超出 5% 且 64 MiB 门槛。这是已触发确认规则的内存失败，不能用此前通过记录或耗时持平覆盖。

| 进程树内存，MiB | 首次基线 → 当前 | 首次增量 | 反向基线 → 当前 | 反向增量 |
| --- | --- | --- | --- | --- |
| HMR peak RSS | 1532.04 → 1747.01 | +214.98 / +14.03% | 1417.33 → 1536.25 | +118.92 / +8.39% |
| HMR steady RSS | 1437.47 → 1654.92 | +217.45 / +15.13% | 1326.05 → 1447.75 | +121.70 / +9.18% |

[原始 artifact](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36760793833/artifacts/11119114206) 与本地副本 `ci-weapp-rss-36760793833-attempt1` 保留两次结果。本次不再次重跑该失败集合。锁文件结构化比对确认已存在依赖的解析变化只涉及根 Rollup、weapp-tailwindcss 的 Oxc 及 tsdown 的 Rolldown 闭包；实际打包 JS 在规范化分块 hash 后只有 Oxc 版本来源注释差异，未发现新增运行时逻辑。上述事实不足以排除原生解析器或构建器内存变化。

另做一次独立内存 profile，复用已准备的精确源码导出目录，current → base 串行执行。Node 24.18 / macOS 下两者分别在第 1、2 次 marker 更新等待 180 秒失败；日志显示 stateful-experimental watcher 已启动，但目标 marker 未到产物。保留每个 Node 进程的 RSS、heapUsed、external、arrayBuffers 与原生模块路径，位于 `.tmp/toolchain-evidence/ci-weapp-rss-profile`。该诊断没有形成完整对照，不能证明 RSS 改善、无退化或云端问题已修复，也没有再次执行正式性能确认。

原采样器虽然临时采集了时序数据，最终只保存总峰值与末段中位数，且没有各进程明细，无法定位云端增加的内存来自哪个进程。因此补齐每次采样的 PID、父 PID、可执行文件名与 RSS，并随 `hmrMemory.samples` 保存到既有 raw artifact。仍使用原有一次系统查询、250 ms 间隔、整个进程树总量和原统计门槛；不采集命令参数。Windows 同步使用 CIM 的 Name 和 WorkingSetSize，并将遍历变量改为 processId，避免写入 PowerShell 只读的 PID 自动变量。后续 CI 必须重新验证，不把本次诊断增强标注为内存优化。

持久回归 `benchmark/version-compare/test/process-memory.test.mjs` 覆盖进程树归属、空格路径、缺失根进程、时序序列化、原统计口径以及真实进程 RSS 明细对账；Benchmark 工作流运行这些回归。Windows 原生执行和本地全面设备验收仍未完成。

本次本地定向验证：`CI=1 pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs --update=none` 通过 5 文件 20 项，包含真实 macOS 进程采样；ESLint 对 benchmark 使用 `--no-ignore` 显式检查，另检查 workflow；`pnpm architecture:check`、`pnpm agents:check` 与 `git diff --check` 通过。未修改生产包，不重复生产构建或已耗尽的性能确认。


### 2026-10-01：整合主线 escape 迁移

整合主线 `0bfb23912` 后，新增的 Oxc 升级回归仍引用 `@weapp-core/escape`，定向验证报 `Cannot find package`。改为与主线一致的 `@weapp-tailwindcss/escape`，保留所有源码位置、转译与 source map 断言；未恢复旧包生产依赖。首次失败日志保留在本轮 `main-sync-core-tests.log`。

本轮验证：`CI=1 pnpm install --frozen-lockfile --offline`、escape 包构建、核心 Oxc/自定义映射/CI 与打包契约 5 文件 78 项、Rollup watch/invalidation 18 项、PostCSS 真实多入口构建契约 1 项、进程内存工具 20 项，以及 `pnpm architecture:check`、`pnpm agents:check` 通过。Oxc 测试文件使用 `eslint --no-ignore` 显式验证；测试输入中的模板插值按源码文本保留。

锁文件保留主线 escape workspace 迁移及本 PR 的 Oxc、Rollup 和 scoped Rolldown 升级归属。未重新采集已耗尽的正式性能样本，历史 RSS 与 HMR 失败不被覆盖；本轮定向回归不代表设备或全端验收。规则未变更。
### Taro Vite 根样式覆盖索引的重复解析

同步 main 后，`db18844f34150a5addacda852bf5716b0e62fa2c` 的 [Benchmark attempt 1](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36844691455/job/110314006918) 在 Taro Vite 微信目标触发四项耗时门禁：HMR median / p95 分别增加 11.14% / 16.17%，插件 median / p95 增加 37.65% / 40.80%。样本和 marker 完整，主要增量在 `tasks.css`；这不能直接归因为 Oxc。

一次独立 CPU 诊断显示两侧共同热点包含 PostCSS 解析/遍历、Rollup AST 和 GC。该诊断有明显 profiler 开销，每侧只保存前 10 段，第三轮 CPU 未完整覆盖；不能替代原 Linux CI 失败或给出性能通过结论。原始日志、20 份 profile 和边界说明保留在 `.tmp/toolchain-evidence/taro-vite-cpu-diagnostic/`，不重复正式确认。

沿调用链发现一项确定的重复工作：`removeCssCoveredByRootStyleAssets` 对每个页面/组件都重新解析相同根 CSS 并建立覆盖索引。新增 [批次复用回归](../../../packages/weapp-tailwindcss/test/bundlers/vite-root-coverage-reuse.test.ts) 在修改前实测 12 个产物解析根样式 12 次，期望 1 次而失败。修复把索引限制在单次产物处理调用内，按实际根 CSS 内容复用；回调改变来源或内容就重建，下次构建重新计算。PostCSS 继续拥有解析和覆盖判断，bundler 只负责批次生命周期。独立分包跳过规则及 CSS 输出语义不变，没有全局缓存或预算调整。

定向验证：上述回归及 `vite-content-init-coverage`、`vite-processed-css-assets.unit` 共 3 文件 54 项通过；PostCSS 相关 3 文件 49 项通过；包闭包构建、源文件与测试显式 lint、architecture:check、agents:check 和 git diff --check 通过。pnpm release status 已确认两包 patch intent，未发布。隔离微基准使用 128 条根规则、12 个产物，预热 5 对，交替执行 15 对；PostCSS 覆盖清理中位数从 5.126 ms 到 1.924 ms，所有结果逐项检查相等。该数字仅反映索引复用，不是整体构建/HMR 提速结论。

`CI=1 pnpm e2e:demo:matrix taro-vite-react-tailwindcss-v4:weapp taro-vite-react-tailwindcss-v4:alipay --update --build-only` 重新生成两个项目目标的 static 基线，无文件差异；随后去掉更新和仅构建参数执行原矩阵，两个目标 production / initial / replace / add / restore 全部通过。日志与产物保留在 `.tmp/toolchain-evidence/root-coverage-*`。这是本机 Node 24 的两个小程序 CLI 目标验证，不包含 IDE/设备验收，也不代表云端性能门禁已修复。仍须等待新 head 的全部适用 CI。

规则评估：沿用既有解析所有权、缓存生命周期和性能证据边界，不新增规则。

### 2026-10-02：同步 main 后的 CSS 比较重复解析

同步 main `2bc33ddc21ef834a36bbafa5887e498793174c1b` 后，head `6eb1d387174939c438ffce21d1a666ebbca0f4e5` 的 [Benchmark attempt 1](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/36963946725/job/110706485323) 在 Taro Vite v4 微信目标触发 `hmrPluginP95`：稳态基线 `[2072, 1994]` ms、当前 `[2460, 2460]` ms，p95 增加 388 ms / 18.73%。构建和 marker 完成；原始日志和 [artifact](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/36963946725/artifacts/11209533993) 保留，不以旧 head 成功代替本轮失败。

增量仍集中在 `tasks.css`，稳态从约 1713 / 1635 ms 增至 2144 / 2139 ms；`finalize.rootCss` 则由约 184 / 183 ms 降至 132 / 133 ms。实际 Taro demo 的 Vite 4.5.14、Rollup 3.30.0 和 Taro runner 依赖与 main 相同，不能直接归因于根 Rollup 或 Oxc 升级，也不能声称此前根覆盖优化解决了本轮失败。

复核既有 CPU 诊断，`restoreDeferredUserCss → filterExistingCssRules` 中规则文本索引与声明索引分别解析同一份 base CSS。此路径属于 CSS task，但旧 macOS profile 有插桩开销和不完整轮次，只能用于热点定位。新增 [CSS 比较生命周期回归](../../../packages/postcss/test/css-rule-matcher.test.ts) 在修复前观察到两次解析而失败；修复后在同一个不可变 base 内懒解析一次，共享只读 AST，两个索引完成即释放 AST。解析失败保持保守结果，新 CSS 创建新的 matcher；未建立全局缓存或跳过转换。

本轮 PostCSS 相关 3 文件 50 项、生成与 bundler 相关 3 文件 223 项通过，两个受影响包的 JS 与类型构建、显式 ESLint 通过。原始失败及验证日志保留在 `.tmp/toolchain-evidence/css-base-reuse-*`。这是确定的重复工作优化，尚不足以证明消除整个 CI 耗时增量；不增加已耗尽的正式确认次数、不放宽预算。设备、全端及 stateful HMR 的未验证边界不变。

微基准使用 1000 条主样式规则、20 份候选 CSS、5 对预热及 15 对交替采样，逐项检查旧／新输出完全相同；中位数由 77.728 ms 降至 60.419 ms。仅比较这段过滤操作，不能推算整个 HMR 的改变量。采样在所有本地构建与 watch 结束后串行执行，完整样本及脚本保留于 `css-base-reuse-micro/`。

`CI=1 pnpm e2e:demo:matrix taro-vite-react-tailwindcss-v4:weapp taro-vite-react-tailwindcss-v4:alipay --update --build-only` 重建两个 static 基线，无差异；去掉 `--update --build-only` 后，两个目标的 production / initial / replace / add / restore 均通过。本次产物单独保存于 `css-base-reuse-demo-artifacts/`。`pnpm architecture:check`、`pnpm agents:check`、`git diff --check` 通过，`pnpm release status` 已确认两包 patch intent，未执行发布。

规则评估：沿用现有所有权与证据边界，不新增规则。
