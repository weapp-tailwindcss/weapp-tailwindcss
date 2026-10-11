# `@weapp-tailwindcss/cn` 与 `@weapp-tailwindcss/merge` 全面对比

本文比较两个小程序运行时包的定位、API、处理链、语义和生态。性能数字见独立的 [`performance-report.md`](./performance-report.md)。上游 `cn` 自称相对 `tailwind-merge` 快很多倍，那份对比见 [`upstream-cn-vs-tailwind-merge.md`](./upstream-cn-vs-tailwind-merge.md)。

## 一句话结论

- `cn()` 是 shadcn 风格单函数，日常 last-wins / clsx / 普通 rpx 宽度冲突与 `twMerge()` 一致。
- 当前对拍里 **0 处不等价**：无。需要 rpx 长度与颜色共存、已转义数字变体合并、`create` / slim / lite 时用 `@weapp-tailwindcss/merge`。

## 测量环境

- 时间：2026-09-30T17:12:41.838Z
- Commit：`bc42340685067d13e0ddc665197662848faaacfa`
- Node：v24.18.0
- OS：darwin 27.0.0 (arm64)
- CPU：Apple M4 Max
- 内存：131072.00 MiB

## 定位

| 包 | 角色 | 上游 |
| --- | --- | --- |
| `@weapp-tailwindcss/cn` | shadcn 风格单函数：条件拼接 + 冲突合并 + 小程序 escape | npm `cn@0.3.0`（编译表 + trie 引擎） |
| `@weapp-tailwindcss/merge` | `tailwind-merge` 兼容运行时，含默认 / slim / lite | `tailwind-merge@3` |

`cn` 对标 `cn(clsx + tailwind-merge)` 这一习惯 API。`merge` 对标完整的 `tailwind-merge` 运行时，包括工厂、配置扩展和体积分级入口。

## API 面

| 能力 | `cn` | `merge` |
| --- | --- | --- |
| 主函数 | `cn(...ClassValue[])` | `twMerge(...ClassValue[])` |
| 只拼接 | 无 | `twJoin`；`./lite` 的 `twMerge` 实际是 join |
| 工厂 | 无 | `create` / `createTailwindMerge` / `extendTailwindMerge` |
| 关闭 escape | 无 | `create({ escape: false })` |
| 体积分级 | 单一入口 | `.` / `./slim` / `./lite` |
| `weappTwIgnore` | 无 | 有 |
| `tailwindMergeVersion` | 无 | `3` |

## 处理流水线

```
@weapp-tailwindcss/cn
  clsx(inputs)
    -> unescape（默认 map）
    -> npm cn 引擎合并（内置 cacheSize=8192）
    -> escape

@weapp-tailwindcss/merge
  clsx(inputs)                         // createRuntimeFactory
    -> 条件 unescape
    -> createRpxLengthTransform.prepare  // text-[12rpx] => text-[length:12rpx]
    -> tailwind-merge
    -> restore rpx
    -> escape
    -> 外层 LRU 256
```

关键差异：

1. `cn` 不走 `createRuntimeFactory`，因此没有 rpx 长度归一化和外层 256 LRU。
2. `cn` 引擎自己带 8192 条缓存；`merge` 外层 256 + `tailwind-merge` 内部缓存。
3. `merge` 可以把 `text-[12rpx]` 转成 `text-[length:12rpx]` 再合并，避免和 `text-red` 抢同一 group。

## 语义对拍

共 17 个静态 case。

- `weapp-cn` vs `weapp-merge`：无
- `weapp-merge-slim` vs `weapp-merge`：`slim-excluded-fill`
- 上游 `cn` vs `twMerge(clsx)`：无

| Case | weapp-cn | weapp-merge | weapp-merge-slim | weapp-merge-lite | upstream-cn | twMerge(clsx) | cn=merge |
| --- | --- | --- | --- | --- | --- | --- | --- |
| short-no-conflict | `flex items-center gap-2` | `flex items-center gap-2` | `flex items-center gap-2` | `flex items-center gap-2` | `flex items-center gap-2` | `flex items-center gap-2` | 是 |
| last-wins | `p-2 text-blue-500` | `p-2 text-blue-500` | `p-2 text-blue-500` | `p-4 p-2 text-red-500 text-blue-500` | `p-2 text-blue-500` | `p-2 text-blue-500` | 是 |
| clsx-object-array | `foo bar baz` | `foo bar baz` | `foo bar baz` | `foo bar baz` | `foo bar baz` | `foo bar baz` | 是 |
| refinement-padding | `p-3 px-5` | `p-3 px-5` | `p-3 px-5` | `p-3 px-5` | `p-3 px-5` | `p-3 px-5` | 是 |
| rpx-width | `w-_b24rpx_B` | `w-_b24rpx_B` | `w-_b24rpx_B` | `w-_b10rpx_B w-_b24rpx_B` | `w-[24rpx]` | `w-[24rpx]` | 是 |
| rpx-text-length | `text-_b24rpx_B` | `text-_b24rpx_B` | `text-_b24rpx_B` | `text-_b12rpx_B text-_b24rpx_B` | `text-[24rpx]` | `text-[24rpx]` | 是 |
| rpx-text-color-keep | `text-red text-_b80rpx_B` | `text-red text-_b80rpx_B` | `text-red text-_b80rpx_B` | `text-red text-_b80rpx_B` | `text-[80rpx]` | `text-[80rpx]` | 是 |
| escaped-modifier | `hover_cp-4` | `hover_cp-4` | `hover_cp-4` | `hover_cp-2 hover_cp-4` | `hover_cp-2 hover_cp-4` | `hover_cp-2 hover_cp-4` | 是 |
| stacked-modifiers | `focus_chover_cp-4` | `focus_chover_cp-4` | `focus_chover_cp-4` | `hover_cfocus_cp-2 focus_chover_cp-4` | `focus:hover:p-4` | `focus:hover:p-4` | 是 |
| important-postfix | `p-4_e p-5` | `p-4_e p-5` | `p-4_e p-5` | `p-3_e p-4_e p-5` | `p-4! p-5` | `p-4! p-5` | 是 |
| custom-plus-tailwind | `custom-card p-2` | `custom-card p-2` | `custom-card p-2` | `custom-card p-4 p-2` | `custom-card p-2` | `custom-card p-2` | 是 |
| arbitrary-variant | `_b_n_cnth-child_p3_P_B_cpy-4` | `_b_n_cnth-child_p3_P_B_cpy-4` | `_b_n_cnth-child_p3_P_B_cpy-4` | `_b_n_cnth-child_p3_P_B_cpy-0 _b_n_cnth-child_p3_P_B_cpy-4` | `[&:nth-child(3)]:py-4` | `[&:nth-child(3)]:py-4` | 是 |
| numeric-leading-escaped | `_2xl_cp-4` | `_2xl_cp-4` | `_2xl_cp-4` | `_2xl_cp-2 _2xl_cp-4` | `_2xl_cp-2 _2xl_cp-4` | `_2xl_cp-2 _2xl_cp-4` | 是 |
| slim-excluded-fill | `fill-blue-500` | `fill-blue-500` | `fill-red-500 fill-blue-500` | `fill-red-500 fill-blue-500` | `fill-blue-500` | `fill-blue-500` | 是 |
| long-list | `flex-col md_cflex-row gap-3 md_cgap-4 font-semibold shadow-md border ...` | `flex-col md_cflex-row gap-3 md_cgap-4 font-semibold shadow-md border ...` | `flex-col md_cflex-row gap-3 md_cgap-4 font-semibold shadow-md border ...` | `flex flex-col md_cflex-row gap-3 md_cgap-4 px-4 py-2 text-sm font-sem...` | `flex-col md:flex-row gap-3 md:gap-4 font-semibold shadow-md border gr...` | `flex-col md:flex-row gap-3 md:gap-4 font-semibold shadow-md border gr...` | 是 |
| component-call | `rounded-md px-4 py-2 text-sm bg-primary text-white` | `rounded-md px-4 py-2 text-sm bg-primary text-white` | `rounded-md px-4 py-2 text-sm bg-primary text-white` | `rounded-md px-4 py-2 text-sm bg-primary text-white` | `rounded-md px-4 py-2 text-sm bg-primary text-white` | `rounded-md px-4 py-2 text-sm bg-primary text-white` | 是 |
| arbitrary-heavy | `h-_b21px_B p-_b8px_B mt-_b3px_B border-_b2px_B w-_b26px_B text-_b18px...` | `h-_b21px_B p-_b8px_B mt-_b3px_B border-_b2px_B w-_b26px_B text-_b18px...` | `h-_b21px_B p-_b8px_B mt-_b3px_B border-_b2px_B w-_b26px_B text-_b18px...` | `w-_b13px_B h-_b21px_B p-_b8px_B mt-_b3px_B text-_b15px_B bg-_b_h11223...` | `h-[21px] p-[8px] mt-[3px] border-[2px] w-[26px] text-[18px] bg-[#abcd...` | `h-[21px] p-[8px] mt-[3px] border-[2px] w-[26px] text-[18px] bg-[#abcd...` | 是 |

超长输出已截断，完整字符串见 `data/parity.json`。`lite` 只拼接、不去冲突。上游两列没有小程序 escape，和 weapp 列不同是预期行为。

### 差异解释

- **`rpx-text-color-keep`**：`merge` 先把 `text-[80rpx]` 归一成 `text-[length:80rpx]`，和 `text-red` 分属颜色 / 长度，结果是 `text-red text-[80rpx]`（转义后）。`cn` 没有这步，把二者当成同一 `text-*` 冲突，只留下 `text-[80rpx]`。上游 `cn` 与上游 `twMerge` 在这一例上也只留长度，说明这是 **weapp merge 的 rpx 工厂**，不是 npm `cn` 独有的回归。
- **`numeric-leading-escaped`**：输入已是小程序转义形态 `_2xl_cp-2 _2xl_cp-4`。`merge` 还原成 `2xl:p-*` 后按同一 group 保留最后一个；`cn` 引擎没把这对 token 识别成同一冲突组，两个都留下。上游两列同样没合并，说明 **这是 `createRuntimeFactory` 的 unescape + tailwind-merge 组合能力**。
- **`slim-excluded-fill`**：slim 配置去掉了 SVG 等低频 group，`fill-red-500` 与 `fill-blue-500` 不会去冲突。这是 slim 的取舍，不是 bug。

## 依赖与产物

| 包 | 运行时依赖 | 入口 |
| --- | --- | --- |
| `cn` | `@weapp-tailwindcss/runtime`、`cn` | 仅 `.` |
| `merge` | `@weapp-tailwindcss/runtime`、`tailwind-merge`、`@weapp-tailwindcss/escape` | `.` / `./slim` / `./lite` |

消费者打包体积（esbuild minify，含传递依赖）：

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

不能用各自 `dist/index.mjs` 的几百字节当体积结论，那只是封装层。

## 生态

- `@weapp-tailwindcss/variants`、`@weapp-tailwindcss/ui` 依赖 merge，不依赖 cn。
- website `packages-runtime` 矩阵尚未列入 `@weapp-tailwindcss/cn`。
- `cn` 没有 `extendTailwindMerge`，不能直接替换 merge 给 variants 当 config。

## 选型建议

| 场景 | 建议 |
| --- | --- |
| 页面/小组件 `cn(base, cond && cls, className)` | `cn`，API 短；gzip 体积与 merge 接近 |
| 组件库、外部 className 覆盖、需要扩展冲突组 | `merge` |
| 只要拼接 + 小程序 escape | `merge/lite` |
| 要冲突合并但想减小默认配置 | `merge/slim`，先核对 slim 未覆盖的 utility |
| 关闭 escape 输出到 Web | 只能 `merge` 的 `create({ escape: false })` |

本任务不改两个包的行为。若后续要让 `cn` 覆盖 rpx 长度归一化或 `create` 工厂，应另开任务。

