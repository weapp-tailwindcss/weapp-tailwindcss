---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1270
baseline: 7bf340388fe5aaf0b83980f08dfca8e8540b5b82
regressions:
  - packages/weapp-tailwindcss/test/js/oxc-class-context-edge-cases.test.ts
---

# AST class 上下文的源码预筛边界修复

## 症状

继续核对 class 上下文时，发现源码文本预筛遗漏了解码后的名称和字面量。输入 `const x = { className: "pages\u002fhome" }`，类名集合明确包含 `pages/home` 时，Babel 输出 `pages_fhome`，Oxc 却保留原字符串。

同类差异涉及 `"\x63lass"`、`"c-l-a-s-s"`、转义或带分隔符的计算属性名、计算属性 `TW-Merge` helper 调用、`r/*comment*/(...)` 和 `c\u006e(...)`。Oxc 的六类最小输入全部不同；Rust 分析路径也遗漏了转义名称、规范化名称与带注释的 helper。

修复前新增的四种语法回归共 64 项，52 项失败、12 项业务路径保护用例通过；Rust 的真实分析单测在带注释的 `r` 调用上失败。

## 根因与纠正

源码是否包含明文斜杠、class 关键词或特定 helper 文本，不能证明解析后的 AST 没有 class 上下文。JavaScript 会解码转义，既有名称规则会移除 `-`、`_`、`:`，注释也允许出现在 callee 与参数之间。

删除 Oxc 与 Rust 的 class 文本预筛。Oxc 在单次 AST 遍历中维护对象属性、JSX 属性和 helper 参数的上下文边界；Rust 使用既有 AST 祖先判断。class 上下文事实也覆盖不含斜杠的字面量，缓存事实与类名集合保持独立。

新增[共享边界输入](../../../packages/weapp-tailwindcss/test/helpers/class-context-edge-cases.ts)，同时验证 Babel 输出、Oxc 字面量事实、公开 JS handler 与真实 Rust ABI。[Rust 分析回归](../../../packages/weapp-tailwindcss/native/src/js/tests.rs)和[真实 ABI 对拍](../../../packages/weapp-tailwindcss/native/test/transform/babel.ts)复用上述语义。普通业务路径与 optional helper 另有保护回归；类名转换继续依赖精确集合命中。

## 验证

2026-10-07，macOS arm64 / Apple M4 Max，pnpm 12.9.1。本轮工作树的 `analysis.ts` SHA-256 为 `6671d6d941ed34dce63140c40ec54077f8c2a807c845cb383a4a93dbc5e6dd08`。

定向 JS/WXML/Vite 回归 62 文件、743 项通过、4 项既有跳过；新增 64 项也通过公开 handler 验证。Engine 六文件、83 项通过。Rust 42 项单测、主包与原生构建、严格 TypeScript、显式覆盖测试文件的 ESLint、Rust 格式检查、架构检查与 change intent 检查通过。

重建后的真实 ABI 验证包含：WXML tokenizer 10018 组、静态属性 10056 组、JS 分析 544 组、完整转换 14096 组；Babel/Rust 对拍 6800 项一致、1024 项明确回退。回调异常、重入及不同集合大小的验证通过。

125082 字节样本沿用输入 SHA-256 `21ad19ea581c664217f72ee2acebc73921de585c680e420c3de594deea09bcf3`。Node 24.18.0，预热后的分析缓存未命中，三轮六十对普通/raw 中位数为 10.728/4.130 ms，倍率 2.597；handler 为 11.619/5.101 ms，倍率 2.278。三轮分析均受益，全部 240 对事实和输出一致。报告为 `.tmp/class-context-raw-after.json`；该实验不包含首次反序列化器初始化。

真实 uni-app CLI 在 Node 22.22.3 下串行运行 off/auto、auto/off、off/auto 三对。基准使用独立目录采集本轮原生调用记录，并逐个校验子进程 Node 版本。中位数如下：

| 指标 | off | Rust auto | 耗时减少 |
| --- | ---: | ---: | ---: |
| 完整 CLI 构建 | 3520.5 ms | 3453.8 ms | 1.89% |
| 插件总计 | 1035 ms | 973 ms | 5.99% |
| generateBundle | 668 ms | 614 ms | 8.08% |
| JS 任务阶段 | 158.6 ms | 35.0 ms | 77.92% |

六次产物 SHA-256 均为 `3ea05a7fc10d410c04aad5def40984fff9b48fad316d8b2e26b4ce41fa4c57f0`。三个 auto 进程各执行 11 次批量候选 ABI，每进程一次 null 按原语义回退，异常为零；off 原生调用为零。Node 峰值 RSS 为 off 490544–505584 KiB、auto 489984–496320 KiB。数据位于 `.tmp/class-context-native-profile-daqvxp/report-v22.22.3.json`。

真实 Vite demo 在 Node 24.18.0 下完成三对 off/required 采样：冷构建 1028.7/1005.7 ms，开发启动 1099.4/1049.1 ms；文本、新增类、删除及恢复 HMR 分别为 70.3/71.5、176.0/178.2、177.8/175.9、156.9/157.2 ms。846 次真实原生调用与全部 DOM、计算样式、页面 session 验证通过。产物 SHA-256 仍为 `560fddf7402079a67bcde204d9d2c468a23fc01c1393241923390ad8b28d346d`。

Vite 的 Node 峰值 RSS 为 off 638464–645040 KiB、required 627968–636560 KiB。六个 worker 均恢复源码，清理、服务端和浏览器错误数组均为空；没有持久修改 demo 或 static 基线。报告为 `.tmp/class-context-vite-after.json`。

主要复验命令：

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/js/oxc-class-context-edge-cases.test.ts --update=none --coverage.enabled=false
pnpm --filter weapp-tailwindcss exec node native/build.mjs
pnpm --filter weapp-tailwindcss exec node native/verify.mjs
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-raw-transfer.ts --pairs 20 --rounds 3 --output .tmp/class-context-raw-after.json
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --compare native --target weapp --output .tmp/class-context-vite-after.json --pairs 3 --timeout-ms 60000
```

## 适用边界

本轮性能是同一修复后实现的 Rust 开关对比，每组仅三对真实构建，不与旧会话的百分比相加。JS 任务阶段包含异步等待；HMR 差异未证明稳定提速。内存只覆盖 Node，不能推导全进程树的稳定收益。

这里证明了上述 class 边界修复与本地定向验证。PR 的完整 CI 仍需在包含本轮修复的 head 上完成；旧 head 的通过不代替新 head。Rust 继续显式启用，完整 PostCSS 管线与全项目 Rust 化不在本次修复范围。

## 规则评估

不新增 AGENTS 规则。落实已有“被跳过处理须证明没有语义贡献”的要求，用解析后事实和真实 ABI 对拍取代不能覆盖语法解码的文本前提。
