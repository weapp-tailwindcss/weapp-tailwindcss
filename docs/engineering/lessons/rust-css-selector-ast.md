---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: c717348f308d6572953fe623c4bdae3437d8fb5d
regressions:
  - packages/postcss/test/native/native-selector-rule.test.ts
  - packages/postcss/test/native-selectors-loader.test.ts
  - packages/postcss/test/selectorParser.test.ts
  - packages/postcss/test/native/native-selectors.test.ts
  - packages/postcss/test/selector-options-mutation.test.ts
  - packages/postcss/test/native/selector-options-mutation.test.ts
---

# Rust 复杂选择器 AST 迁移

## 症状

原生简单 selector 内核遇到 pseudo、attribute、tag 和 universal 时仍回退，因此项目自有的 where/is 展开、RTL 分支删除、不支持伪类过滤和子代替换仍在 JavaScript AST 上运行。逐节点 NAPI 会额外传输节点并保留原有解析成本，不能解决这一边界。

## 根因与纠正

新增 Rust `SelectorRuleTransformer`，构造时固化选项，规则调用只传 UTF-16 selector，返回 selector 字符串、remove 和 spacing 动作。arena AST、分支克隆、展开和平台资格全部在 Rust 内部；PostCSS 保留规则/声明所有权和用户插件 API。spacing selector 的识别和替换在 Rust，声明镜像、去重与变量排序仍由原 TS 阶段执行。

遍历必须兼容 selector-parser 的可变游标：插在当前节点之前的展开分支不会再次遍历；被删除的原节点仍继续走其子节点。where 多分支、嵌套 is/where、RTL 中的 not 删除、uniAppX 先改名再移除分支等既有顺序均按当前行为保留。伪类名称中的 raw escape 不能按解码后名称匹配策略。

生产接线首轮发现 `.a,` 差异：selector-parser 对紧贴末尾的逗号单独记录 root trailingComma，而有尾空白时记录空 selector。Rust 增加同样的元数据，保留 cleanup 后的尾逗号。另补删除规则后调用方持有的 selector/声明状态，避免只比较最终 CSS 掩盖对象行为差异。

原生成功后不会再次调用 JS parser；显式 `null` 才回退。原生执行异常继续传播，加载器同时检查构造器和 prototype.transform，损坏 ABI 不能由另一份 binding 掩盖。旧的简单 selector ABI 保留供兼容实验，生产通过新 class 一次调用，Rust 内部复用简单路径。

## 验证

Node 24.18.0、macOS arm64、PostCSS 8.5.28、postcss-selector-parser 7.1.6。本阶段的 release 二进制 SHA-256 为 `fd3a8951f39ad925f0c155e0c5aed84b150cf896435777d1b84e5834e976f0fe`。

- 直接 AST 与生产路径都对比旧实现：固定语义矩阵 × 五组配置、2,000 组有种子的嵌套伪类生成输入、1,000 组任意 UTF-16 类名组合。
- 全部 CSS fixture 共 2,877 条规则 × 五组配置 = 14,385 组，其中原生支持 14,345 组。排除 TS 原有简单 ASCII 跳过路径后为 6,260/6,300；剩余 40 组为四类小数百分比 keyframes。此统计只代表现有 fixture，不代表完整 CSS 语法覆盖。
- `cargo test --manifest-path packages/postcss/native/Cargo.toml --locked`：12 项通过。
- `cargo clippy --manifest-path packages/postcss/native/Cargo.toml --locked --all-targets -- -D warnings`：通过。
- `pnpm --filter @weapp-tailwindcss/postcss build:native` 和 `pnpm --filter @weapp-tailwindcss/postcss build`：release、ESM/CJS 和类型通过。
- `CI=1 WEAPP_TW_NATIVE=required pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`：129 文件、1,341 项通过、3 项既有跳过。
- `CI=1 WEAPP_TW_NATIVE=off pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`：129 文件、1,341 项通过、3 项既有跳过。原生差分测试内部仍会强制 required。

命令在复用依赖的工作树添加 `--config.verify-deps-before-run=false`，避免 pnpm 自动安装写入共享链接。本阶段按集成任务调度暂缓正式性能采样，仅运行 `native/benchmark.mts --check` 输出一致性检查；脚本现已覆盖复杂 selector root 并用实际生产 class 统计接管数量。之前简单 selector 的性能数字不能用于新 AST 实现。

### 后续测试入口边界修正

以上 129 文件的历史验证把真实 ABI 用例和普通用例放在同一入口，导致普通 CI 若未构建二进制，会被测试内部的 required 强制加载阻断。后续把五个真实 ABI 文件移入 `test/native/`，修正 fixture 相对路径；普通配置始终排除该目录，mock loader/platform 测试保留在普通入口。`vitest.native.config.ts` 单独包含该目录、强制 required，并在 setup 验证模式与真实加载，缺失二进制必须失败，不允许自动 skip。

验证时仅将本工作树拥有的二进制暂存到 `os.tmpdir()` 创建的独立目录，用 try/finally 还原，哈希未改变。无二进制、默认 auto 下，普通入口 124 文件、1,252 项通过、3 项既有跳过。专用原生入口在 setup 抛出两个 `Cannot find module` 子错误，0 项执行、1 个 suite 失败，证实没有静默回退或 skip；最初的验证脚本误判 Vitest 会输出 AggregateError 外层中文，但 Vitest 实际展开了子错误，修正的是日志断言，不是产品失败边界。还原后专用入口五文件通过；外部设置 `WEAPP_TW_NATIVE=off` 也由配置强制为 required。

当前真实 ABI 命令为 `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --config vitest.native.config.ts --update=none --coverage.enabled=false`。普通入口和真实原生门禁都必须运行；设置环境变量不会自动把真实 ABI 文件加入普通测试配置。

### 后续配置生命周期审计

复用同一个 options 并修改字段时，旧 JS 并非统一读取配置：root/universal 在创建 transformer 时固定，hover/active/focus Set 首次创建后缓存，child 替换在首次实际使用时缓存，uniAppX 每次读取；结果缓存又未包含这些选项。新原生实例在首次调用时统一固化，因此引入额外差异。最小复现为先处理 `.warm:hover`，再改 child 为 text：off 输出 text+text，原生仍输出 view+view；改 uniAppX 后处理新的 `[hidden]` selector 也会漂移。先走简单 `.warm` 快路再打开 hover 开关时，off 保留 hover，原生却删除规则。

修复将相关配置快照统一放在 `ruleTransformSync` 入口。root/universal/child 按数组内容比较并复制，三个伪类开关和 uniAppX 按有效布尔值比较，escapeMap 复用内容快照。配置内容变化时重建整个 transformer：新的选项身份同时刷新 JS 子缓存、原生实例和 selector 结果缓存。未改变的配置继续复用；不再保留旧 JS 混合冻结时机产生的缺陷，验收以等价新 options 对象的输出为准。此行为修复有中文 patch intent。

先增加回归再修复：普通 off 的九组场景在修复前七组失败，真实 ABI 对拍八组失败；覆盖等长数组原地修改、配置删除、空 child、三个开关和 uniAppX 往返、escapeMap 增删改，以及首次使用时机。修复后普通选项/selector/loader 三文件 63 项通过；真实 ABI 六文件 99 项通过；ESM/CJS、类型和源码 ESLint 通过。本次没有修改 Rust ABI、重编二进制或进行性能采样。

## 适用边界

注释、命名空间、部分 CSS escape/自定义映射和小数 keyframes 仍走原 AST。深度达到 128 或展开 arena 超过 100,000 个节点时显式回退，不静默截断输出。普通 CSS/SCSS parser、声明级 spacing、其他平台/颜色/单位变换仍未迁移；精确状态见[覆盖清单](../../../packages/postcss/native/MIGRATION.md)。

本机尚未证明新路径的稳定性能收益，也没有真实框架冷构建、HMR、峰值内存或其他平台运行证据；本阶段不能称为完整 CSS 或整个项目 Rust 化。没有修改 demo 源码或 static 基线，没有创建浏览器资源。

## 规则评估

不新增规则。通过持久差分测试约束可变遍历顺序、尾逗号元数据、删除对象状态、ABI 错误与实例复用。兼容实现保留 postcss-selector-parser 的 MIT 版权许可，平台分发继续复制完整第三方许可文件。
