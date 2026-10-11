# `@weapp-tailwindcss/cn` vs `@weapp-tailwindcss/merge` 性能报告

这份报告可以单独阅读，不依赖对比报告。这里只比 weapp 包装后的 `cn` / `merge`。上游 npm `cn` 对 `tailwind-merge` 的宣称倍数见 [`upstream-cn-vs-tailwind-merge.md`](./upstream-cn-vs-tailwind-merge.md)。数字全部来自本机实测。

## 结论摘要

- last-wins 稳态：`cn` 5.41 M ops/s，`merge` 4.48 M ops/s（merge/cn = 0.83×）。
- cache-hit：`cn` 4.63 M ops/s，`merge` 4.51 M ops/s。
- cache-miss：`cn` 343.9 k ops/s，`merge` 299.0 k ops/s。
- 消费者 minify gzip：`cn` 13.8 KiB，`merge` 11.6 KiB。
- 语义：`cn` 与 `merge` 不一致的静态 case 为 无。输出不同的行不能只按速度排名。

## 环境

- 时间：2026-09-30T17:12:44.303Z
- Commit：`bc42340685067d13e0ddc665197662848faaacfa`
- Node：v24.18.0
- OS：darwin 27.0.0 (arm64)
- CPU：Apple M4 Max
- 内存：131072.00 MiB

## 方法

- 每个受试者在**独立 Node 子进程**中加载，避免 JIT 和缓存互相污染。
- 子进程启用 `--expose-gc`。
- 先测冷启动（import 后第一次调用），再 warmup 300 次，然后采集 400 个稳态样本；每个样本是 25 次调用的平均耗时。
- 延迟用 `process.hrtime.bigint()`，ops/s 由稳态中位数换算。
- 内存：`cache-hit` / `cache-miss` / `long-list` 在 GC 后各跑 8000 次，看 `heapUsed` 增量。
- 体积：esbuild `bundle + minify`，再 gzip9 / brotli。工作目录是本 package，以便解析 workspace 依赖。
- `lite` 只 join，不参与「谁合并得更快」的结论。

### 受试者

| id | 实现 | escape | 冲突合并 |
| --- | --- | --- | --- |
| weapp-cn | @weapp-tailwindcss/cn | 是 | 是 |
| weapp-merge | @weapp-tailwindcss/merge | 是 | 是 |
| weapp-merge-slim | @weapp-tailwindcss/merge/slim | 是 | 是 |
| weapp-merge-lite | @weapp-tailwindcss/merge/lite (twJoin) | 是 | 否（join） |

## 体积

| 受试者 | raw | gzip9 | brotli |
| --- | --- | --- | --- |
| @weapp-tailwindcss/cn | 32.9 KiB | 13.8 KiB | 12.2 KiB |
| @weapp-tailwindcss/merge | 34.8 KiB | 11.6 KiB | 10.2 KiB |
| @weapp-tailwindcss/merge/slim | 25.1 KiB | 9.4 KiB | 8.4 KiB |
| @weapp-tailwindcss/merge/lite | 11.4 KiB | 4.9 KiB | 4.4 KiB |
| cn() | 25.5 KiB | 10.5 KiB | 9.3 KiB |
| cn.twMerge | 25.5 KiB | 10.5 KiB | 9.3 KiB |
| tailwind-merge twMerge | 26.8 KiB | 8.4 KiB | 7.3 KiB |
| clsx + tailwind-merge | 27.1 KiB | 8.5 KiB | 7.4 KiB |

## 主对比：weapp-cn vs weapp-merge

`merge/cn` > 1 表示 merge 更快。`输出` 列来自同一套静态对拍。

| Case | cn ops/s | merge ops/s | cn p50 | merge p50 | cn p95 | merge p95 | merge/cn | 较快 | 输出 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| short-no-conflict | 23.06 M ops/s | 15.38 M ops/s | 43 ns | 65 ns | 93 ns | 147 ns | 0.67× | cn | 相同 |
| last-wins | 5.41 M ops/s | 4.48 M ops/s | 185 ns | 223 ns | 303 ns | 375 ns | 0.83× | cn | 相同 |
| clsx-object-array | 8.57 M ops/s | 8.22 M ops/s | 117 ns | 122 ns | 222 ns | 298 ns | 0.96× | cn | 相同 |
| refinement-padding | 12.24 M ops/s | 13.04 M ops/s | 82 ns | 77 ns | 88 ns | 88 ns | 1.07× | merge | 相同 |
| rpx-width | 7.50 M ops/s | 7.41 M ops/s | 133 ns | 135 ns | 158 ns | 160 ns | 0.99× | cn | 相同 |
| rpx-text-length | 7.06 M ops/s | 6.74 M ops/s | 142 ns | 148 ns | 162 ns | 170 ns | 0.96× | cn | 相同 |
| rpx-text-color-keep | 7.10 M ops/s | 6.82 M ops/s | 140 ns | 147 ns | 147 ns | 178 ns | 0.96× | cn | 相同 |
| escaped-modifier | 7.41 M ops/s | 6.90 M ops/s | 135 ns | 145 ns | 162 ns | 170 ns | 0.93× | cn | 相同 |
| stacked-modifiers | 6.52 M ops/s | 6.45 M ops/s | 153 ns | 155 ns | 162 ns | 162 ns | 0.99× | cn | 相同 |
| important-postfix | 6.45 M ops/s | 6.06 M ops/s | 155 ns | 165 ns | 162 ns | 178 ns | 0.94× | cn | 相同 |
| custom-plus-tailwind | 5.94 M ops/s | 6.12 M ops/s | 168 ns | 163 ns | 180 ns | 202 ns | 1.03× | merge | 相同 |
| arbitrary-variant | 5.77 M ops/s | 5.82 M ops/s | 173 ns | 172 ns | 183 ns | 182 ns | 1.01× | merge | 相同 |
| numeric-leading-escaped | 7.06 M ops/s | 7.14 M ops/s | 142 ns | 140 ns | 150 ns | 173 ns | 1.01× | merge | 相同 |
| slim-excluded-fill | 6.38 M ops/s | 6.52 M ops/s | 157 ns | 153 ns | 163 ns | 162 ns | 1.02× | merge | 相同 |
| long-list | 1.38 M ops/s | 1.38 M ops/s | 727 ns | 725 ns | 738 ns | 842 ns | 1.00× | merge | 相同 |
| component-call | 4.76 M ops/s | 5.00 M ops/s | 210 ns | 200 ns | 232 ns | 220 ns | 1.05× | merge | 相同 |
| arbitrary-heavy | 3.66 M ops/s | 3.55 M ops/s | 273 ns | 282 ns | 330 ns | 352 ns | 0.97× | cn | 相同 |
| component-call-fresh | 1.83 M ops/s | 1.87 M ops/s | 547 ns | 535 ns | 835 ns | 818 ns | 1.02× | merge | 相同 |
| working-set | 3.23 M ops/s | 3.32 M ops/s | 310 ns | 302 ns | 458 ns | 412 ns | 1.03× | merge | 相同 |

## 全受试者吞吐

| Case | weapp-cn | weapp-merge | weapp-merge-slim | weapp-merge-lite |
| --- | --- | --- | --- | --- |
| short-no-conflict | 23.06 M ops/s | 15.38 M ops/s | 21.42 M ops/s | 20.68 M ops/s |
| last-wins | 5.41 M ops/s | 4.48 M ops/s | 5.04 M ops/s | 5.13 M ops/s |
| clsx-object-array | 8.57 M ops/s | 8.22 M ops/s | 8.45 M ops/s | 8.22 M ops/s |
| refinement-padding | 12.24 M ops/s | 13.04 M ops/s | 11.54 M ops/s | 11.11 M ops/s |
| rpx-width | 7.50 M ops/s | 7.41 M ops/s | 7.41 M ops/s | 7.50 M ops/s |
| rpx-text-length | 7.06 M ops/s | 6.74 M ops/s | 6.67 M ops/s | 6.98 M ops/s |
| rpx-text-color-keep | 7.10 M ops/s | 6.82 M ops/s | 6.90 M ops/s | 7.06 M ops/s |
| escaped-modifier | 7.41 M ops/s | 6.90 M ops/s | 7.06 M ops/s | 7.06 M ops/s |
| stacked-modifiers | 6.52 M ops/s | 6.45 M ops/s | 6.74 M ops/s | 6.52 M ops/s |
| important-postfix | 6.45 M ops/s | 6.06 M ops/s | 6.45 M ops/s | 6.25 M ops/s |
| custom-plus-tailwind | 5.94 M ops/s | 6.12 M ops/s | 6.12 M ops/s | 6.12 M ops/s |
| arbitrary-variant | 5.77 M ops/s | 5.82 M ops/s | 5.71 M ops/s | 5.66 M ops/s |
| numeric-leading-escaped | 7.06 M ops/s | 7.14 M ops/s | 7.23 M ops/s | 7.06 M ops/s |
| slim-excluded-fill | 6.38 M ops/s | 6.52 M ops/s | 6.59 M ops/s | 6.52 M ops/s |
| long-list | 1.38 M ops/s | 1.38 M ops/s | 1.39 M ops/s | 1.39 M ops/s |
| component-call | 4.76 M ops/s | 5.00 M ops/s | 5.08 M ops/s | 5.04 M ops/s |
| arbitrary-heavy | 3.66 M ops/s | 3.55 M ops/s | 3.55 M ops/s | 3.61 M ops/s |
| cache-hit | 4.63 M ops/s | 4.51 M ops/s | 4.51 M ops/s | 4.55 M ops/s |
| cache-miss | 343.9 k ops/s | 299.0 k ops/s | 297.7 k ops/s | 541.5 k ops/s |
| component-call-fresh | 1.83 M ops/s | 1.87 M ops/s | 1.88 M ops/s | 1.79 M ops/s |
| working-set | 3.23 M ops/s | 3.32 M ops/s | 3.14 M ops/s | 3.15 M ops/s |

## 冷启动（第一次调用）

| Case | weapp-cn | weapp-merge | weapp-merge-slim | weapp-merge-lite |
| --- | --- | --- | --- | --- |
| short-no-conflict | 485.38 µs | 2.04 ms | 1.40 ms | 140.88 µs |
| last-wins | 167.54 µs | 411.50 µs | 263.38 µs | 94.83 µs |
| clsx-object-array | 80.08 µs | 104.71 µs | 48.42 µs | 33.88 µs |
| refinement-padding | 21.38 µs | 35.50 µs | 23.42 µs | 8.00 µs |
| rpx-width | 252.00 µs | 261.63 µs | 252.71 µs | 235.58 µs |
| rpx-text-length | 81.38 µs | 87.54 µs | 140.79 µs | 156.29 µs |
| rpx-text-color-keep | 52.13 µs | 33.50 µs | 49.63 µs | 27.58 µs |
| escaped-modifier | 197.33 µs | 170.96 µs | 145.00 µs | 143.04 µs |
| stacked-modifiers | 66.92 µs | 65.38 µs | 45.33 µs | 33.21 µs |
| important-postfix | 38.04 µs | 23.33 µs | 20.21 µs | 24.58 µs |
| custom-plus-tailwind | 16.13 µs | 29.33 µs | 11.50 µs | 7.63 µs |
| arbitrary-variant | 60.67 µs | 18.38 µs | 27.46 µs | 24.54 µs |
| numeric-leading-escaped | 49.92 µs | 33.21 µs | 35.38 µs | 54.88 µs |
| slim-excluded-fill | 13.63 µs | 9.92 µs | 6.75 µs | 5.83 µs |
| long-list | 133.42 µs | 159.29 µs | 153.83 µs | 47.92 µs |
| component-call | 37.83 µs | 34.96 µs | 80.83 µs | 19.75 µs |
| arbitrary-heavy | 414.17 µs | 502.25 µs | 386.08 µs | 32.71 µs |
| cache-hit | 20.00 µs | 28.67 µs | 25.54 µs | 6.83 µs |
| cache-miss | 126.92 µs | 119.29 µs | 134.33 µs | 55.33 µs |
| component-call-fresh | 22.79 µs | 246.13 µs | 217.50 µs | 6.50 µs |
| working-set | 33.71 µs | 13.67 µs | 24.17 µs | 3.71 µs |

## 缓存与内存

| Case | weapp-cn | weapp-merge | weapp-merge-slim | weapp-merge-lite |
| --- | --- | --- | --- | --- |
| cache-hit | 4.63 M ops/s | 4.51 M ops/s | 4.51 M ops/s | 4.55 M ops/s |
| cache-miss | 343.9 k ops/s | 299.0 k ops/s | 297.7 k ops/s | 541.5 k ops/s |
| working-set | 3.23 M ops/s | 3.32 M ops/s | 3.14 M ops/s | 3.15 M ops/s |

heapUsed 增量（8000 次调用后，负值表示 GC 后堆变小）：

| Case | weapp-cn | weapp-merge | weapp-merge-slim | weapp-merge-lite |
| --- | --- | --- | --- | --- |
| cache-hit | -5.1 KiB | -7.1 KiB | -7.0 KiB | -2.3 KiB |
| cache-miss | 849.4 KiB | 49.0 KiB | 17.7 KiB | 6.9 KiB |
| long-list | -16.2 KiB | -19.9 KiB | -14.1 KiB | -13.0 KiB |
| working-set | 4.3 KiB | 4.3 KiB | 4.3 KiB | 4.3 KiB |

## 如何阅读这些数字

- 每个受试者进程的**第一条 case**（本矩阵是 `short-no-conflict`）包含引擎初始化，冷启动会明显偏大；后面的 case 才是「函数已热」的第一次调用。
- 命中缓存时 `merge` 外层 LRU 让稳态更快；唯一输入的 `cache-miss` 上 `cn` 通常更快，因为它没有 rpx prepare/restore，引擎表查找比 `tailwind-merge` 配置图更轻。
- 上游 `cn` 在命中路径可以到数千万 ops/s，weapp `cn` 慢一截主要是每次 escape/unescape。这是小程序兼容成本，不是引擎退化。
- gzip 后默认 `merge` 可能略小于 `cn`：`tailwind-merge` 压缩率更好，`cn` 的编译表 + engine 压缩后不一定更小。
- `lite` 只 join，不参与「谁合并得更快」。
- 本机结果不能当 CI 门禁；相对顺序比绝对值更有参考价值。

生成时间：2026-09-30T17:12:44.455Z

