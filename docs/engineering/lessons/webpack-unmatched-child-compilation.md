---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1270
baseline: b26d9eda75c0ed3ac926bf81093620c3939f4d86
regressions:
  - packages/weapp-tailwindcss/test/bundlers/webpack.v5-child-compilation.test.ts
---

# Webpack 无匹配产物的子编译边界

## 症状

Benchmark run `37600892003` 的 Mpx 分片在冷构建插件指标上退化 21.77%：main 的三次样本为 571、588、638 ms，当前分支为 716、681、754 ms。完整构建中位数反而减少 1.59%，不能因此放行插件门禁，也没有直接重跑失败任务。

原始阶段表显示，main 选中的样本含 HTML、JS、CSS 转换；当前选中的样本没有转换任务，主要时间在 runtime。性能采集器从多次 `processAssets` 中选择较慢的一次，因此需要先确认编译归属。

## 根因与纠正

真实产物探针确认 Mpx 为 `stringify.wxs` 建立子编译。该子编译只有一个 WXS 产物，现有 CSS、模板、JS、WXS matcher 均未命中，仍执行源码扫描、类名准备、刷新标记消费和缓存裁剪。父编译随后又处理 41 个产物、8 个样式产物。共享状态不应由无匹配产物的子编译消费。

在 matcher 分类后检查真实 `Compiler.isChild()`。只有子编译且 CSS、模板、JS 分组全为空时提前返回。用户显式匹配 WXS，或子编译包含匹配的样式、模板、JS 时仍继续处理；父编译的既有生命周期继续保留。没有按框架名、WXS 文件名或文件大小判断，也没有改原生模式或扫描的八槽位预算。

新增回归使用真实 JS handler 验证后续父编译的精确类名转换，同时保护刷新标记、源码注册和缓存。有效修复前结果为 2 项失败、4 项通过；修复后与既有 Webpack、运行时元数据、rpx warning 回归合计 178 项通过。早期测试夹具的参数和回调选择错误已纠正，不把那些失败计为产品回归证据。

## 验证

2026-10-07，macOS arm64 / Apple M4 Max，Node 22.23.3、pnpm 12.9.1。在同一 demo 路径以修复前 dist 快照与修复后 dist 交替运行三对冷构建；Engine、PostCSS 和 demo 输入保留 302 项指纹，扫描后未发现哈希变化。

| 指标 | 修复前 | 修复后 | 耗时减少 |
| --- | ---: | ---: | ---: |
| Mpx 完整 CLI 冷构建中位数 | 5794.3 ms | 5682.8 ms | 1.92% |
| 冷构建插件指标中位数 | 381 ms | 360 ms | 5.51% |
| 保存到 watch 产物更新中位数 | 2575.7 ms | 2138.4 ms | 16.98% |
| watch 插件指标中位数 | 591 ms | 179 ms | 69.71% |

六次冷构建产物 SHA-256 均为 `cae4122f4f73f3c1e1d4546f45ebfdc3f482e2ea02b8284f01737e06ad3f4488`。watch 同样采用 before/after、after/before、before/after 三对，每轮启动独立服务、保存一次新增类、验证本轮 marker 与转义后的类名、恢复源码并停止服务。36 个记录到的进程均已结束。报告在 `.tmp/mpx-child-compilation-after/report.json`、`.tmp/mpx-child-hmr/alternating.json`。

重新构建后的 Vite 在 Node 24.18.0 下完成三对 off/required 采样，冷构建中位数 1018.3/996.5 ms，减少 2.14%；文本 HMR 88.9/110.4 ms，新增类 HMR 181.3/177.4 ms。846 次真实原生调用、产物哈希、DOM、计算样式与页面 session 验证通过；所有 worker 恢复源码并清理服务与浏览器。报告为 `.tmp/webpack-child-vite-final.json`。文本 HMR 没有稳定提速证据，Node 峰值 RSS 区间也有重叠，不能宣称稳定内存收益。

主包构建及声明生成、显式包含新增测试的 ESLint、架构检查、规则检查和 intent 检查通过。直接执行主包全部测试源码的 TypeScript 检查仍遇到既有跨包 rootDir 和 style-injector readonly tuple 等错误；日志保留在 `.tmp/mpx-child-compilation-after/typecheck.log`。新增回归的严格类型检查按实际包声明边界进行，不宣称全包测试源码的类型检查通过。

定向命令：

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack.v5-child-compilation.test.ts test/bundlers/webpack.v5.unit.test.ts test/bundlers/webpack.v5-runtime-metadata.unit.test.ts test/bundlers/webpack-rpx-warning.test.ts --update=none --coverage.enabled=false
pnpm --filter weapp-tailwindcss build
```

诊断夹具首次 watch 因 dist 快照缺少包内依赖解析路径而启动失败；添加指向同一主包依赖的链接后重新测量。临时调用还误用 `--output`，使 runner 写入 tracked 默认报告；已经保留首次失败报告，并恢复本任务覆盖的原报告，最终显式使用 `--out`。带 CPU profiler 的一次当前实现诊断未完成，已中断本任务进程，不使用它做性能结论。

## 适用边界

这些收益属于减少重复扫描，在 `WEAPP_TW_NATIVE=off` 下测量，不能与 Rust 开关收益相加。每项仅三对本地样本，CI 使用 Ubuntu；当前修复 head 的性能门禁仍需独立完成。watch 数据是保存到构建产物更新，未声称为小程序设备画面延迟，也没有用该结果代替 Vite 的浏览器 HMR 验证。

## 规则评估

不新增 AGENTS 规则。按已有构建图和生命周期边界修复，并用产物哈希、父编译回归和显式 matcher 保护证明跳过的子编译没有转换贡献。
