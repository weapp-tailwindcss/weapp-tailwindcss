---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: fb2421b1bb20c36e9bb4019b039b012ae9003e17
regressions:
  - packages/postcss/test/native-selector-transform.test.ts
  - packages/postcss/test/native-selectors.test.ts
  - packages/postcss/test/native-selectors-loader.test.ts
  - packages/postcss/test/native-selector-platform.test.ts
---

# Rust 选择器边界验证

## 症状

第一次 Rust 迁移只把已解码类名送入 `escapeClasses`。1/8/64 类名批次比 TypeScript 慢，带 AST 的选择器 root 约慢 11–15%。语言切换没有自动带来吞吐提升。

## 根因与纠正

原路径仍需要 JavaScript 解析选择器，再增加一次 `walkClasses`、Set/Map 分配、UTF-16 字符串数组双向传递。Rust 只省下很小的字符映射循环，无法抵消边界开销。

现在 `transformSelector` 在 Rust 内完成原始选择器 tokenize、CSS escape 解码、类名转义和紧凑序列化。返回最终字符串，不传 AST；`transformSelectors` 提供批量入口。已解码类名批次仍用于差分验证，但从生产管线移除。简单 ASCII 类名的既有跳过路径仍先运行，成功的转换仍由既有 selector cache 复用。

UTF-16 代理项、非 BMP 字符、无效 Unicode escape、开头数字和双连字符由差分测试覆盖。复杂伪类、属性、标签、注释、特殊 escape 终止符和自定义映射返回兼容路径；原生执行异常继续抛出，不用异常回退隐藏缺陷。PostCSS 保留规则与声明的所有权、插件调用顺序和平台语义。

## 验证

本机 Node 24.18.0、Apple M4 Max、macOS arm64。相同输入、相同进程、8 轮预热、35 对交替采样，计时前比较完整输出。基准为 `packages/postcss/native/benchmark.mts`；输出记录依赖、二进制和输入哈希、全部样本及 median/p95。

首轮 median：

| 输入 | TypeScript | Rust | TypeScript/Rust |
| --- | ---: | ---: | ---: |
| 单类名 root，20 次 | 0.1724 ms | 0.0923 ms | 1.87 |
| 8 类名 root，20 次 | 0.5565 ms | 0.1385 ms | 4.02 |
| 64 类名 root，20 次 | 3.6579 ms | 0.6964 ms | 5.25 |
| v4.css，42,472 bytes | 4.4191 ms | 4.3222 ms | 1.02 |
| v4-postcss.css，22,311 bytes | 1.2711 ms | 1.2734 ms | 1.00 |
| NutUI style.css，261,151 bytes | 17.8059 ms | 14.8028 ms | 1.20 |

补齐依赖/二进制信息后的有限复测仍交替采样 35 对：v4 为 5.0504→4.7959 ms，v4-postcss 为 1.3645→1.3688 ms，NutUI 为 21.2385→19.2072 ms。NutUI 两轮收益约 11–20%，不能把单轮 20% 当作固定收益。1/8/64 类名 root 的复测倍数为 2.17/4.07/5.93。排除 TypeScript 已经直接跳过的简单选择器，三个真实 fixture 实际有资格进入 Rust 的规则分别为 39/396、3/46、252/1760；只报原生语法支持数量会夸大迁移覆盖。

实际依赖为 PostCSS 8.5.28、postcss-selector-parser 7.1.6、workspace escape 0.0.1；复测二进制 SHA-256 为 `e0b02643567d0413167793eaed25ce81b219aa2e75a69772f1e92a0c146218f1`。

真实 fixture 输入 SHA-256：

- v4.css：`168a8f3879a953d5d2fa45001a3b143971bf27175dcf9b1fc5d2efe3beba150d`
- v4-postcss.css：`d0071b8139c3c1c489ee522e1c8a74ad71628cdb3977acad41303f3e8b5e6870`
- NutUI style.css：`a1f5735b3157769309eae2fe99ee418006d0b5cf4729fa0a666e9a5946a731e8`

已运行：

- `cargo test --manifest-path packages/postcss/native/Cargo.toml --locked`：6 项通过。
- `cargo clippy --manifest-path packages/postcss/native/Cargo.toml --locked --all-targets -- -D warnings`：通过。
- `pnpm --filter @weapp-tailwindcss/postcss build`：ESM/CJS 与声明生成通过。
- `CI=1 WEAPP_TW_NATIVE=required pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`：125 文件，1,266 项通过、3 项既有跳过。
- `CI=1 WEAPP_TW_NATIVE=off pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`：新增平台测试后 126 文件，1,273 项通过、3 项既有跳过。
- 最终原生二进制与平台路由的 4 文件定向回归：46 项通过；`pnpm agents:check`、ESLint 和 `git diff --check` 通过。
- 新增回归含 1,000 组随机 UTF-16/CSS escape 组合对拍、真实 CSS fixture 选择器批次、用户 PostCSS 插件与平台兼容路径。

该 worktree 复用已有依赖，pnpm 12 自动依赖检查会尝试写入共享 `.pnpm` 链接；本轮命令级使用 `--config.verify-deps-before-run=false`，没有重新安装或改写共享依赖。

## 适用边界

表格只测 PostCSS parse、选择器转换与 stringify，没有完整 PostCSS 插件管线、真实 Vite 冷构建/HMR、峰值 RSS 的证据。v4 两个 fixture 基本持平，不能推导整体构建加速。跨平台后缀路由有回归，八平台二进制构建和分发由原生发布矩阵验证；本机不能证明全部平台实际加载成功。

此交付迁移的是 CSS 选择器内核的一部分。通用 CSS parser/value parser、复杂伪类展开、平台声明兼容、颜色/单位和用户 PostCSS 插件仍未迁移，不能宣称完整 CSS Rust 化。没有用 Lightning CSS 整体替换现有管线。

## 规则评估

不新增规则。现有规则已要求以输入哈希、输出差分和真实框架证据区分局部与整体收益；这次通过扩大可证明的内核边界解决性能问题。
