# 上游 `cn` vs `tailwind-merge` 性能报告

这份报告只比较 npm 上的 `cn` 和 `tailwind-merge`，**不含** `@weapp-tailwindcss/*` 的 escape / rpx 包装。可以单独阅读。weapp 包装后的对比见 [`performance-report.md`](./performance-report.md)。

数字全部来自本目录脚本的本机实测。不用 `cn` README 的 30× / 37× / 172× 当结论。

## 结论摘要

- 版本：`cn@0.3.2`，`tailwind-merge@3.7.0`，`clsx@2.1.1`。
- 对标他们宣传的 drop-in：`cn()` vs `twMerge(clsx(...))`。
- 参数引用稳定的组件调用 `component-call`：cn 相对倍数 10.27×。
- 每次新建参数数组 `component-call-fresh`：6.00×。
- 64 组工作集循环 `working-set`：1.35×。
- 每次唯一字符串 `cache-miss`：0.36×。这条上更快的一方不一定是 cn。
- 长列表且参数引用稳定 `long-list`：39.06×。
- 语义：`cn()` vs `twMerge(clsx)` 不一致 无；`cn.twMerge` vs `twMerge` 不一致 无。

宣传里的 30× 来自「相同字符串实例 + 调用序列预测」，不是任意 class 合并都快 30 倍。唯一输入时优势会消失，有时还会更慢。

## 环境

- 时间：2026-09-30T17:12:44.303Z
- Commit：`bc42340685067d13e0ddc665197662848faaacfa`
- Node：v24.18.0
- OS：darwin 27.0.0 (arm64)
- CPU：Apple M4 Max
- 内存：131072.00 MiB

## 他们怎么宣称

[cn README](https://github.com/shadcn-ui/cn) 写的是 drop-in 替换 `clsx` + `tailwind-merge`，并且 [30× faster](https://github.com/shadcn-ui/cn#how-much-faster)。[how-it-works](https://github.com/shadcn-ui/cn/blob/main/docs/how-it-works.md) 把 30× 解释成：

1. 冲突规则编译成 typed array 表，运行时不再走 config / regex / Map trie。
2. **Argument cache**：组件反复传入同一批字符串实例时，指针比较后直接返回。
3. **调用序列预测**：render loop 里连 lookup 都跳过，大约 10 ns。
4. 字符串要出现两次才进 whole-string cache，一次性 SSR 字符串不污染缓存。

他们公布的表（不是本机数字）：

| 他们的 scenario | clsx + tailwind-merge | cn | 宣称倍数 | 本报告对应 case |
| --- | --- | --- | --- | --- |
| the call your components make most | 320 ns | 10 ns | 30× | component-call |
| same classes as last render (cache hit) | 14 ns | 7 ns | 1.9× | cache-hit / component-call |
| typical component strings, warm | 13 ns | 7 ns | 1.9× | last-wins / short-no-conflict |
| thousands of recurring strings | 2.4 µs | 14 ns | 172× | working-set |
| cold render, many arbitrary values | 3.4 µs | 1.1 µs | 3.0× | arbitrary-heavy + cache-miss 形态 |
| cold render, SSR-style unique strings | 2.3 µs | 360 ns | 6.4× | cache-miss |
| very first call (page load) | 3.2 ms | 0.4 ms | 7× | 进程内第一条 case 的 coldStart |

方法差异：他们每个实现 × 负载单独子进程、warmup、取 5 次 timed block 的最好成绩。我们是每个实现一个子进程，跑完全部 case；warmup 300 次后采 400 个稳态样本（每样本 25 次调用的平均）。绝对值不能和他们那张表逐 ns 对齐，看相对倍数和「什么负载快」。

## 受试者

| id | 调用 | 对标 |
| --- | --- | --- |
| upstream-cn | `cn()` | 他们推荐的 drop-in |
| upstream-cn-twmerge | `cn.twMerge()` | 只合并，不含 clsx 风格对象 |
| upstream-twmerge | `twMerge()` | tailwind-merge 本体 |
| upstream-twmerge-clsx | `twMerge(clsx(...))` | 今天大多数项目的写法 |

## 体积（esbuild minify，含传递依赖）

| 受试者 | raw | gzip9 | brotli |
| --- | --- | --- | --- |
| cn() | 25.5 KiB | 10.5 KiB | 9.3 KiB |
| cn.twMerge | 25.5 KiB | 10.5 KiB | 9.3 KiB |
| tailwind-merge twMerge | 26.8 KiB | 8.4 KiB | 7.3 KiB |
| clsx + tailwind-merge | 27.1 KiB | 8.5 KiB | 7.4 KiB |

## 主对比：`cn()` vs `twMerge(clsx(...))`

`cn/twMerge(clsx)` > 1 表示 cn 更快。

| Case | cn() ops/s | twMerge(clsx) ops/s | cn p50 | tw p50 | cn/tw | 较快 | 输出 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| short-no-conflict | 33.33 M ops/s | 20.68 M ops/s | 30 ns | 48 ns | 1.61× | cn() | 相同 |
| last-wins | 33.33 M ops/s | 6.59 M ops/s | 30 ns | 152 ns | 5.06× | cn() | 相同 |
| clsx-object-array | 11.54 M ops/s | 10.34 M ops/s | 87 ns | 97 ns | 1.12× | cn() | 相同 |
| refinement-padding | 33.33 M ops/s | 15.00 M ops/s | 30 ns | 67 ns | 2.22× | cn() | 相同 |
| rpx-width | 54.59 M ops/s | 14.63 M ops/s | 18 ns | 68 ns | 3.73× | cn() | 相同 |
| rpx-text-length | 35.26 M ops/s | 12.77 M ops/s | 28 ns | 78 ns | 2.76× | cn() | 相同 |
| rpx-text-color-keep | 59.95 M ops/s | 13.96 M ops/s | 17 ns | 72 ns | 4.29× | cn() | 相同 |
| escaped-modifier | 66.67 M ops/s | 14.29 M ops/s | 15 ns | 70 ns | 4.67× | cn() | 相同 |
| stacked-modifiers | 54.59 M ops/s | 12.24 M ops/s | 18 ns | 82 ns | 4.46× | cn() | 相同 |
| important-postfix | 42.81 M ops/s | 13.64 M ops/s | 23 ns | 73 ns | 3.14× | cn() | 相同 |
| custom-plus-tailwind | 59.95 M ops/s | 13.04 M ops/s | 17 ns | 77 ns | 4.60× | cn() | 相同 |
| arbitrary-variant | 60.10 M ops/s | 10.34 M ops/s | 17 ns | 97 ns | 5.81× | cn() | 相同 |
| numeric-leading-escaped | 66.67 M ops/s | 15.00 M ops/s | 15 ns | 67 ns | 4.45× | cn() | 相同 |
| slim-excluded-fill | 66.67 M ops/s | 13.04 M ops/s | 15 ns | 77 ns | 5.11× | cn() | 相同 |
| long-list | 60.10 M ops/s | 1.54 M ops/s | 17 ns | 650 ns | 39.06× | cn() | 相同 |
| component-call | 85.62 M ops/s | 8.33 M ops/s | 12 ns | 120 ns | 10.27× | cn() | 相同 |
| arbitrary-heavy | 85.91 M ops/s | 5.04 M ops/s | 12 ns | 198 ns | 17.04× | cn() | 相同 |
| cache-hit | 50.00 M ops/s | 10.17 M ops/s | 20 ns | 98 ns | 4.92× | cn() | — |
| cache-miss | 284.0 k ops/s | 789.5 k ops/s | 3.52 µs | 1.27 µs | 0.36× | twMerge(clsx) | — |
| component-call-fresh | 36.36 M ops/s | 6.06 M ops/s | 27 ns | 165 ns | 6.00× | cn() | — |
| working-set | 7.95 M ops/s | 5.88 M ops/s | 125 ns | 170 ns | 1.35× | cn() | — |

## 合并本体：`cn.twMerge` vs `twMerge`

去掉 clsx，只比冲突合并。

| Case | cn.twMerge ops/s | twMerge ops/s | cn p50 | tw p50 | cn/tw | 较快 |
| --- | --- | --- | --- | --- | --- | --- |
| short-no-conflict | 37.54 M ops/s | 29.98 M ops/s | 27 ns | 33 ns | 1.25× | cn.twMerge |
| last-wins | 6.19 M ops/s | 7.14 M ops/s | 162 ns | 140 ns | 0.87× | twMerge |
| clsx-object-array | 13.33 M ops/s | 13.19 M ops/s | 75 ns | 75 ns | 1.01× | cn.twMerge |
| refinement-padding | 17.64 M ops/s | 18.75 M ops/s | 57 ns | 53 ns | 0.94× | twMerge |
| rpx-width | 16.21 M ops/s | 15.38 M ops/s | 62 ns | 65 ns | 1.05× | cn.twMerge |
| rpx-text-length | 13.63 M ops/s | 14.64 M ops/s | 73 ns | 68 ns | 0.93× | twMerge |
| rpx-text-color-keep | 15.38 M ops/s | 14.64 M ops/s | 65 ns | 68 ns | 1.05× | cn.twMerge |
| escaped-modifier | 15.79 M ops/s | 15.78 M ops/s | 63 ns | 63 ns | 1.00× | cn.twMerge |
| stacked-modifiers | 11.76 M ops/s | 13.33 M ops/s | 85 ns | 75 ns | 0.88× | twMerge |
| important-postfix | 15.78 M ops/s | 16.21 M ops/s | 63 ns | 62 ns | 0.97× | twMerge |
| custom-plus-tailwind | 13.33 M ops/s | 14.29 M ops/s | 75 ns | 70 ns | 0.93× | twMerge |
| arbitrary-variant | 10.91 M ops/s | 10.91 M ops/s | 92 ns | 92 ns | 1.00× | twMerge |
| numeric-leading-escaped | 16.67 M ops/s | 16.67 M ops/s | 60 ns | 60 ns | 1.00× | 持平 |
| slim-excluded-fill | 13.64 M ops/s | 12.76 M ops/s | 73 ns | 78 ns | 1.07× | cn.twMerge |
| long-list | 1.52 M ops/s | 1.54 M ops/s | 658 ns | 650 ns | 0.99× | twMerge |
| component-call | 8.00 M ops/s | 8.57 M ops/s | 125 ns | 117 ns | 0.93× | twMerge |
| arbitrary-heavy | 5.17 M ops/s | 5.31 M ops/s | 193 ns | 188 ns | 0.97× | twMerge |
| cache-hit | 9.09 M ops/s | 10.00 M ops/s | 110 ns | 100 ns | 0.91× | twMerge |
| cache-miss | 1.13 M ops/s | 774.2 k ops/s | 885 ns | 1.29 µs | 1.46× | cn.twMerge |
| component-call-fresh | 6.12 M ops/s | 7.59 M ops/s | 163 ns | 132 ns | 0.81× | twMerge |
| working-set | 6.00 M ops/s | 6.52 M ops/s | 167 ns | 153 ns | 0.92× | twMerge |

## 和宣传口径对齐的几行

- `component-call`：cn() 85.62 M ops/s / 12 ns，twMerge(clsx) 8.33 M ops/s / 120 ns，cn 相对倍数 10.27×。
- `component-call-fresh`：cn() 36.36 M ops/s / 27 ns，twMerge(clsx) 6.06 M ops/s / 165 ns，cn 相对倍数 6.00×。
- `cache-hit`：cn() 50.00 M ops/s / 20 ns，twMerge(clsx) 10.17 M ops/s / 98 ns，cn 相对倍数 4.92×。
- `working-set`：cn() 7.95 M ops/s / 125 ns，twMerge(clsx) 5.88 M ops/s / 170 ns，cn 相对倍数 1.35×。
- `cache-miss`：cn() 284.0 k ops/s / 3.52 µs，twMerge(clsx) 789.5 k ops/s / 1.27 µs，cn 相对倍数 0.36×。
- `long-list`：cn() 60.10 M ops/s / 17 ns，twMerge(clsx) 1.54 M ops/s / 650 ns，cn 相对倍数 39.06×。
- `arbitrary-heavy`：cn() 85.91 M ops/s / 12 ns，twMerge(clsx) 5.04 M ops/s / 198 ns，cn 相对倍数 17.04×。
- `last-wins`：cn() 33.33 M ops/s / 30 ns，twMerge(clsx) 6.59 M ops/s / 152 ns，cn 相对倍数 5.06×。

## 怎么读

- `component-call` 复用同一参数数组，最接近他们说的「组件每次 render 传入同一批字符串实例」。这条上 cn 应该明显更快。
- `component-call-fresh` 每次 `() => [base, variant, extra]` 新建数组。字符串字面量仍然 intern，但数组身份变了。若 30× 主要靠 argument identity / 序列预测，这里倍数会掉下来。
- `working-set` 在 64 组预先分配好的参数之间循环，对应「真实仓库的工作集」。
- `cache-miss` 每次拼新字符串，对应 SSR / 动态 class。whole-string cache 帮不上忙。
- `long-list` 参数引用稳定时，cn 可能把整次合并变成一次缓存命中，倍数会非常大；这测的是缓存，不是「合并 30 个 utility 的算法」。
- 每个受试者进程的第一条 case 冷启动包含引擎初始化。`tailwind-merge` 第一次建 trie 更贵，和他们「首调用 3.2 ms vs 0.4 ms」是同一类现象，但我们的绝对值会因为 harness 不同而变。

生成时间：2026-09-30T17:12:44.609Z

