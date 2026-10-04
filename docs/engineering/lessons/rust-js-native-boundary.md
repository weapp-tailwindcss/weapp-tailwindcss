---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/7bd913cb2
baseline: 7bd913cb2b2294b4ec0c270f7d7cc72ffc3fe855
regressions:
  - packages/weapp-tailwindcss/test/js/native-analysis.test.ts
  - packages/weapp-tailwindcss/test/js/native-transform.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-class-context.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-source-type.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-parser.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-parser-contract.test.ts
  - packages/weapp-tailwindcss/test/native.test.ts
  - e2e/preflight-wechat-page.test.ts
  - packages/weapp-tailwindcss/test/js/handler-cache-lifecycle.test.ts
---

# Rust JS 转换的语义与生命周期

## 症状

将 Oxc AST 搬到 JavaScript 仍有跨语言对象构造与遍历成本。只把 parser 换成原生，也不能证明完整转换与 Babel 等价：条件字面量、class 上下文、template quasi 边界和语法早期错误具有不同语义。

## 根因与纠正

- Rust 实例持有解析事实缓存，在内核里完成候选切分、精确 classSet 命中、转义和代码替换，只返回代码。TypeScript 继续拥有公开 API、用户回调、source map、模块图与兼容入口。
- UTF-16 位置与输入必须保真；孤立代理项不能经 UTF-8 无损解析时，显式交还 Babel。Oxc JavaScript 接口也加入同样的原始字符串防护。
- 原生 `null` 是语义回退，直接交给 Babel；不可再由较宽松的 Oxc 分析重新接管。加载不可用与语义不支持分开处理，执行异常不被兼容 catch 吞掉。
- 工厂参数包含最终有效映射，Rust 不维护一份容易漂移的默认字典。第一版每次验证类集合完整内容，在 10 万项集合下抵消了内核收益；后续改为 `transformWithCandidates`，只查询当前源码实际候选，每次调用重新查询并在调用内部去重，等长 delete/add 立即生效。映射内容变化重建实例。实例由 WeakMap/GC 拥有，不保留用户回调；异常身份、重入和缓存淘汰边界见 [候选成员查询复盘](js-native-candidate-membership.md)。
- 原生检查先于短 JS 结果缓存，否则先 `off` 后 `required` 会返回旧缓存，隐藏缺失二进制。原生成功结果不进入这层缓存，解析事实由原生实例缓存。
- Oxc 的 TS ESTree template element 区间包含标点，JS ESTree 只包含正文。分析统一为正文区间，替换不能根据正文首尾字符猜测边界。显式 class 上下文使用 Babel 的对象属性、JSX 属性和 helper 父链语义，普通业务斜杠路径仍受保护。
- 默认 `sourceType` 按 Babel 的 `script` 语义处理，TS/JSX 由真实 parser plugins 决定，不能根据扩展名放宽语法。特殊解析选项交还 Babel；`sourceFilename` 与缓存配置只提供元数据，不阻止快速路径。direct eval 按 AST 识别，覆盖空格、换行、注释与 optional 调用。

## 验证

本机 macOS arm64、Node 24.18.0、pnpm 12.6.0、Rust 1.96.0。命令从仓库根执行：

```sh
pnpm --filter weapp-tailwindcss exec node native/build.mjs
pnpm --filter weapp-tailwindcss exec node native/verify.mjs
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false
pnpm --filter weapp-tailwindcss exec vitest run test/js test/wxml test/native.test.ts --update=none --coverage.enabled=false
pnpm --filter weapp-tailwindcss exec tsx native/test/transform/adapter-benchmark.ts --self-check
pnpm --filter weapp-tailwindcss exec tsx native/test/transform/adapter-benchmark.ts ../../.tmp/rust-native/adapter-benchmark.json
```

定向回归另覆盖 Vite JS production wrapper、runtime signature、candidate HMR 状态和架构契约。`native/verify.mjs` 强制 `WEAPP_TW_NATIVE=required`，包含 WXML 真 ABI、JS 分析/签名与完整转换差分；完整转换不能仅由 mock 测试或编译成功证明。

第一版完整转换接线已通过 56 文件、605 项定向测试，另有 4 项既有跳过。真实 ABI 覆盖 544 个解析组合、10,064 个转换组合及可变集合/映射生命周期；后续上下文与语法检查修订须重新验证，不能沿用这一数字充当最终结果。

`c5304ba44` 内核及本轮解析适配修订的真实 ABI 验证通过：WXML 10,018 组、JS 分析 544 组（88 组明确回退）、完整转换 14,096 组、生命周期 7 项、Babel 输出 6,224 组与明确回退 1,024 组，零差异。首次集成复验暴露了 `sourceFilename` 错误阻挡和 TS 空 quasi 区间不一致；修正后对应 32 项回归通过。严格 TypeScript 检查显式使用 `--noCheck false`，不能将声明构建的 `noCheck: true` 当作类型验收。

125,082 字节基准固定输入 SHA-256 为 `21ad19ea581c664217f72ee2acebc73921de585c680e420c3de594deea09bcf3`。适配器基准比较实际公开 handler 的 `off`/`required` 路径，以 6/1,000/10,000/100,000 类集合观察验证集合内容的成本。每组 3 轮、每轮 20 对，交替顺序，比较每次输出并记录锁文件、二进制、被测源码和输入哈希。cold 指预热进程中的解析缓存未命中，warm 指命中；均不是进程冷启动。self-check 只证明脚本路径，不作为性能结论。

## 适用边界

- 目前完整转换沿用已有 Oxc 快速路径启用范围。Babel 用户回调、ignore、source map 与 module graph 仍有明确兼容路径，不把这部分称为 Rust 已覆盖。
- 第一版集合内容检查是线性开销，大集合已经观察到性能退化。候选查询修订必须重新验证公开适配器；不能以工厂外微基准代替包含 TypeScript 适配器的验证。
- JavaScript fallback、原生 parser、完整转换和运行时 signature 是不同入口，各自必须有实际调用证据。`required` 确认加载路径，不意味着每一种语法都能原生处理。
- 类型检查发现 Vite 与独立 Rollup 依赖版本不同；输出身份只依赖 dir/file/format，hook 参数从 Vite 自身类型推导，避免把无关插件上下文类型跨版本耦合。
- 本记录不证明全仓、多端、跨系统 CI 或整体构建提速。完整验收仍需本轮环境预检，真实 Vite cold build/HMR/RSS 数据需在最终内核集成后重新采样。

2026-10-04 的全面环境预检 `b58cdb56-ca43-4dbe-9326-e2afe20e8306` 失败：微信 DevTools 探针在页面读取时报 `Cannot destructure property 'rawPath' of 't.getPageMetaByWebviewId(...)' as it is null`；iOS 同时存在两个候选设备，未得到唯一目标。base/HBuilderX/Android/Harmony/Web 通过，computer use 未运行。全面测试未启动，本轮探针连接和临时项目已由预检清理；恢复后需要重新 prepare，不能复用这份失败报告。

微信失败定位为自动化连接已就绪、页面元数据尚未就绪的时序窗口。探针增加有期限的只读重试；错误项目身份仍立即失败，不能等待成假成功。23 项预检回归通过；新一轮 `f05286d0-9059-4eeb-ab1e-dd187d1af9d4` 的实际微信交互和截图通过。iOS 目标歧义与 computer use 未完成仍阻断全面验收，后续须重新 prepare。

## 规则评估

不新增根规则。原生目录已有 UTF-16、无安装期编译、兼容回退与 ABI 差分要求；本次用持久测试落实具体生命周期与语义边界。
