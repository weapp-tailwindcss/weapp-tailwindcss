---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 95cc50bee46dfc3a8eb5e0afe23cf85c0fbc1272
regressions:
  - packages/postcss/test/native/native-value-transform.test.ts
  - packages/postcss/test/native/native-escape-mutation.test.ts
  - packages/postcss/test/native-selectors-loader.test.ts
  - packages/postcss/test/native-selector-platform.test.ts
  - packages/postcss/test/uni-app-x.test.ts
---

# Rust 值转换、加载与映射缓存验证

## 症状

选择器阶段之后，Tailwind v4 的空变量 fallback、gradient fallback 拆分和位置变量 fallback 仍在 JavaScript 中分别解析同一声明。uvue translate 的直接逗号替换也重复解析每条值。

首个 Rust value AST 实现复制每个 token 的 UTF-16 文本。虽然 gradient 三个阶段合并后更快，49 字节 translate 的单值与 256 条批次分别比 TypeScript 慢约 10% 和 22%。只增加批量接口不足以解决分配成本。

审查还发现两个独立问题：加载器先选本地二进制，并可能用第二个原生绑定掩盖已安装平台包的损坏；escape map 缓存按对象身份复用，同一个对象的内容变化可能返回旧映射或旧 selector 结果。

## 根因与纠正

Rust 内部实现了与 postcss-value-parser token/空白归属兼容的 value AST，三个 v4 阶段只解析一次。uvue 在原声明遍历中先执行 v4 转换，再收集 transform 声明批量传入 Rust，按原顺序回写。嵌套 var 的逗号、字符串、URL、注释和 UTF-16 孤立代理项保持不变。AST 不跨 NAPI，也没有替换用户可见 PostCSS AST。

将 token 的 `Vec<u16>` 改为借用输入切片的 `Cow<[u16]>`，静态替换符号也借用常量，避免每个节点复制文本。未闭合值与达到 256 层的嵌套显式返回 `null`，仍由既有解析器完成；原生转换抛错继续向上传递，不以重新执行旧实现隐藏错误。保留 postcss-value-parser 的 MIT 版权与许可。

加载器先解析已安装平台包；只有解析错误为 `MODULE_NOT_FOUND` 才尝试本地二进制。一旦平台包存在，加载或 ABI 错误结束原生查找。`auto` 可以使用 TypeScript，`required` 抛出原始错误；后续从 auto 切换到 required 同样保留第一次错误。Linux 缺少可用 libc 信息时返回不支持，不能猜测 musl。

CSS 私有映射边界按有效内容创建稳定快照，隔离 escape 包原有的身份缓存。修改同一 map 的键、值、删除项或显式默认对象后重新生成快照；selector cache 同步失效。等同默认值的映射可进入 Rust 简单 selector 路径，真正自定义的映射保留 AST。没有修改 escape 包的公开 API 或跨包缓存实现。

## 验证

环境为 Node 24.18.0、Apple M4 Max、macOS arm64，PostCSS 8.5.28、postcss-value-parser 4.2.0。`packages/postcss/native/value-benchmark.mts` 在同一进程先断言完整输出一致，8 轮预热、35 对交替采样，输出输入/二进制 SHA-256、依赖、全部样本和 median/p95。

复制 token 版本的 median（保留慢样本）：

| 输入 | TypeScript | Rust | TypeScript/Rust |
| --- | ---: | ---: | ---: |
| gradient fallback，169 字节 × 1000 | 4.375 ms | 2.773 ms | 1.58 |
| translate，49 字节 × 1000 | 0.956 ms | 1.054 ms | 0.91 |
| translate，256 个不同值共 14,627 字节 | 0.226 ms | 0.275 ms | 0.82 |
| v4.css，42,472 字节 | 2.168 ms | 1.640 ms | 1.32 |
| v4-postcss.css，22,311 字节 | 0.462 ms | 0.458 ms | 1.01 |
| NutUI，261,151 字节 | 10.905 ms | 10.762 ms | 1.01 |

借用 token 版本的 median：

| 输入 | TypeScript | Rust | TypeScript/Rust |
| --- | ---: | ---: | ---: |
| gradient fallback × 1000 | 6.681 ms | 2.553 ms | 2.62 |
| translate × 1000 | 0.996 ms | 0.771 ms | 1.29 |
| translate，256 个不同值 | 0.209 ms | 0.169 ms | 1.24 |
| v4.css | 1.925 ms | 1.569 ms | 1.23 |
| v4-postcss.css | 0.487 ms | 0.477 ms | 1.02 |
| NutUI | 16.037 ms | 16.382 ms | 0.98 |

复制版本二进制 SHA-256 为 `e5b8e6aad16935e6c4017547aef1b1e1c6eba3cab75752101dee52a17c07618a`，借用版本为 `b57db6b54d6901d0fb8156753a05dd792bfafd21b620d48f72fd968bfa9bc45f`。这两轮环境与输入一致，但 TypeScript 基线仍有波动，只能以各轮交替对照评价局部结果，不能宣称固定收益。更早的 NutUI 轮次还出现 8.472→9.682 ms 的退化，没有删去或通过重复跑取最佳值。

输入 SHA-256：

- gradient：`d45f6506f016a038df461d49ab9e3bf5a195a93af740935eea6577f85de5e2ad`
- translate：`e8676de881240a31ce9fd7e7c168aad8e876cf36580e3345a5b2ecfb02c22d63`
- translate 批次：`91c88e9ac43b2b5f2debd03fed3815cb95f2800ca741ddc5bce96f8c91e11c31`
- v4.css：`168a8f3879a953d5d2fa45001a3b143971bf27175dcf9b1fc5d2efe3beba150d`
- v4-postcss.css：`d0071b8139c3c1c489ee522e1c8a74ad71628cdb3977acad41303f3e8b5e6870`
- NutUI：`a1f5735b3157769309eae2fe99ee418006d0b5cf4729fa0a666e9a5946a731e8`

通过的本地验证：

- `cargo test --manifest-path packages/postcss/native/Cargo.toml --locked`：10 项通过。
- `cargo clippy --manifest-path packages/postcss/native/Cargo.toml --locked --all-targets -- -D warnings`：通过。
- `pnpm --filter @weapp-tailwindcss/postcss build:native`：release 二进制构建通过。
- `CI=1 WEAPP_TW_NATIVE=required pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`：128 文件、1,304 项通过、3 项既有跳过。
- `CI=1 WEAPP_TW_NATIVE=off pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`：128 文件、1,304 项通过、3 项既有跳过。原生差分测试会在单个用例中强制原生；其他管线测试使用此关闭模式。
- `pnpm --filter @weapp-tailwindcss/postcss build`：ESM/CJS 和声明文件生成通过；该配置使用 `noCheck: true`，不能作为严格类型检查通过的证据。保留既有 CJS 与 mixed exports 提示。
- 对修改的 TS 源码和 benchmark 执行 ESLint：通过；test 目录被仓库 lint 配置忽略，测试质量由 Vitest 验证。

值回归包含 3,000 组有种子的嵌套语法/任意 UTF-16 差分，以及全部现有 CSS fixture 的 8,970 条声明值（15 条实际触发所选 v4 变换）。初次测试的 fixture 数量下限猜测为大于 10,000 条/20 条变换，实际数量较小，因此修正数量断言为大于 8,000 条/至少一条变换；没有放宽任何输出差分断言。

真实代码路径另覆盖 uvue 声明批次、用户 PostCSS 插件、平台转换、map 原地增删改、默认对象变更、安装包损坏、缺少 ABI、原生执行错误与返回批次长度错误。原始采样放在忽略的 `.tmp/css-value-benchmark*.json`；此记录保留关键数字与可复现脚本。

该 worktree 复用已有依赖；命令级添加 `--config.verify-deps-before-run=false`，避免 pnpm 12 的自动安装写入共享 `.pnpm` 链接。没有修改共享依赖、demo 源码或 static 基线。

## 适用边界

声明 fixture 计时仅包含 PostCSS parse、所选 v4 声明归一化与 stringify。它不包含完整平台插件管线、真实 Vite 冷构建/HMR、RSS 或其他平台运行，不能从微基准推导整体项目加速。NutUI 没有稳定收益。

本轮只接管所选三个 v4 阶段和 uvue translate 值变换。CSS/SCSS parser、复杂 selector/pseudo、单位、颜色、完整变量展开和其他平台变换仍有未迁移模块，详见[覆盖清单](../../../packages/postcss/native/MIGRATION.md)。没有将回调层留在 JS 当作其内部全部计算已迁移，也没有用 Lightning CSS 整体替换 PostCSS。

本机只证明 macOS arm64 二进制加载。八平台分发、打包、真实框架与全面环境验收由集成任务分别验证；本子任务未启动全面测试，也没有浏览器或设备资源需要清理。

## 规则评估

更新已有 `packages/postcss/native/AGENTS.md` 的值转换职责、差分入口、异常边界和许可要求，没有新增规则文件。具体加载优先级、可变 map 与声明错配风险通过持久回归约束；未把实验数字设为普遍性能保证。
