---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f9f0cd0aad68f3e0774790d15b87fc443c7ef4e8
regressions:
  - packages/weapp-tailwindcss/test/build/benchmark-js-runtime.test.ts
  - packages/weapp-tailwindcss/test/build/benchmark-js-snapshots.test.ts
  - packages/weapp-tailwindcss/test/build/benchmark-contracts.test.ts
---

# 私有 JS 基准的源码入口与历史数据

## 症状

原 scripts 严格检查剩余的十二条工具诊断与一条核心 alias 诊断，来自已失效的私有包子路径、已删除的 SWC 实现、旧 v3 生成调用和模块/可选字段契约。真实 CLI 的 Babel/OXC 加载失败仍被 catch 后吞掉，进程返回成功，per-file 命令还可能保存缺失测量侧的报告。

## 根因与纠正

公开类型从 `weapp-tailwindcss/types` 消费。低级 Babel/OXC handler 没有公开 runtime 子路径，私有工具通过既有仓库根定位函数读取当前源码，保留原低级 handler 和选项，不换成带缓存、native 或运行时管理的外层 API。加载在 warmup 与测量之前完成，返回原函数，不包裹被测调用。

首版对两者都使用 require，真实 OXC 因 ESM-only `oxc-walker` 的 exports 边界失败；保留此失败日志，改为 OXC 使用 `pathToFileURL` 后原生 import，Babel 保持既有 require/alias 路径。没有改产品依赖或补造 package exports。

### 当前测量与历史快照

可执行引擎只包含 Babel/OXC；默认只选择这两个。显式 SWC 在读取输入前报退役错误，未知或空列表同样失败，不映射为 Babel，也不伪造 SWC 样本。归档 version1 快照仍允许 SWC 元数据、每文件统计、相对 Babel 比率和同键差异；历史域与当前可运行域分开。

nearest-rank、p95、均值、比率、零基线策略、warmup、测量循环及 OXC 不支持时的原 Babel fallback 均保留。一个引擎发生实际测量异常时携带首因抛出，保存或比较报告之前停止。可选 save/compare 和比率字段明确允许既有 own-property 的 undefined，没有删改对象形状。

### 旧生成脚本与模块边界

旧 `get-decl` 调用 v3 PostCSS 生成器，并写向已经删除的 CSS 变量模块；当前 v4 不支持此 API，亦无该生成产物的消费者。两个旧命令别名保留为明确的中文非零拒绝，说明无直接等价替代、样式生成应经 weapp-tailwindcss。保留 `var.css` 原字节，它仍是规则扫描测试的实际 fixture；不把打包现存 CSS 的 `build:css` 冒称为替代生成器。

WXML 私有源码引用去掉 `.ts` 后缀，保持原 interop guard；核心 compilation 的类型引用改为真实同包相对路径。没有打开 allowImportingTsExtensions、扩大 paths/包含范围或修改严格 flags。

## 验证

新增真实 CLI 回归在原源码先八失败、一对照通过。首版源码加载修复仍有两个 OXC ESM 失败，完成传输边界修复后通过。独立复核再指出新测试的 Windows glob 与 preload 边界；原生文件路径只在 glob 入口按平台分隔符转为逻辑路径后转义，preload 使用 file URL。直接对反斜杠加方括号调用 fast-glob 转换的首个控制失败也保留，不能修改预期迎合丢失目录分隔符的结果。最终五文件141项覆盖盘符、UNC、空格、方括号、两 CLI、真实 Babel/OXC 样本、实际 eval fallback、无输入前的 engine 拒绝、测量异常不写报告、SWC 历史 JSON 与两个 WXML 消费测试；正常测试使用 `--update=none`。失败注入只存在于临时测试 preload，不进入产品或基准代码。

原标准 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false` 从24降至11条，仍失败，全部位于 PostCSS 的 Result/Document、插件阶段与精确可选字段边界。

## 适用边界

私有 CLI 的单次样本仅证明入口可用，不用于正式性能判断，也不能清除已有 RSS 或本地全面验收阻塞。两个旧 get-decl 别名实际执行均非零退出，var.css 的执行前后哈希相同，已删除模块未重建。

现存744份 dist 声明在执行既有 build:types 后有多处哈希变化，不能声称字节全部不变。另用同一编译器、相同既有构建选项，在内存 CompilerHost 仅替换目标源文件为提交前内容，不写 checkout，比较两次各738份新生成声明：唯一差异为 compilation 声明的两行 import 顺序，目标 JavaScript 相同；它证明本次源码引用修复未改变声明签名，不能代替仍有11条错误的严格检查。

## 规则评估

不新增 AGENTS 规则或发布 intent：现有私有工具、真实模块边界和失败证据要求已经覆盖；核心类型引用不改变公开契约，声明产物另行比对。
