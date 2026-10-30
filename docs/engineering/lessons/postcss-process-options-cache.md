---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: d2c4e7dd85772e121fa5ef4b775cc722478145e1
regressions:
  - packages/postcss/test/processing-callback-cache.test.ts
  - packages/postcss/test/process-options-cache-policy.test.ts
  - packages/postcss/test/root-cache-document.test.ts
---

# PostCSS 处理回调的函数身份不能证明结果可复用

## 症状

相同 CSS 连续调用同一个 handler，parser、syntax、stringifier 或 source map 回调的闭包状态已经改变，第二次却返回旧颜色、旧 banner、旧映射注释或旧来源映射。更换两个合法的 Syntax 实例时，即使禁用最终结果缓存，仍可能执行第一个实例的 parser。

## 根因与纠正

结果缓存原本只排除外部作者插件，处理选项的函数指纹只保存稳定的函数身份。函数对象不变并不代表闭包状态不变。原型方法、私有状态及非枚举字段也不在按值指纹覆盖的范围中；合并选项 LRU 和处理选项 WeakMap 可能比最终结果更早复用旧配置。

在 `postcssOptions.options` 的边界统一判定快照资格：只接受指纹覆盖的普通可枚举数据、密集数组及标量。函数、访问器、原型实例、symbol 和指纹未覆盖的字段均按不透明配置处理；资格检查不主动调用访问器。检测范围不扫描整个样式配置，因此内部 preflight 函数和诊断回调不影响默认命中。

含不透明处理选项时，合并选项和 ProcessOptions 快照逐次生成，文本及 Root 完整结果不读写缓存，也不按原始文本裁剪平台插件。Pipeline 与 Processor 仍可复用：这些处理选项由每轮新建的 LazyResult 读取，不参与插件工厂构造。不能把此策略混用为外部作者插件判定，否则会无端增加作者处理阶段。

## 验证

本工作树独立依赖、Node 24.22.1/pnpm 12.15.0：

- 新回归先准确复现6个旧 CSS／映射结果，默认缓存与 parser 特征控制2项通过。早期新测试中 syntax 缺少 stringify、map.prev 回调误返回 JSON 文本而非实际文件路径的错误已修正，日志保留，不计为产品失败。
- 仅禁最终结果后，另两个回归仍失败：不同不透明 Syntax 实例复用旧合并配置、同一处理选项替换实例后取得旧快照。随后将同一准入策略用于这两层配置缓存。
- 回归保留相同回调身份，只改变闭包；以 fresh handler 的真实输出核对 CSS 与映射，另核对实际调用增长、Root 独立性及本轮 Input 来源。map.prev 使用本轮系统临时目录中的真实 map 文件，在 finally 删除。
- 独立复核补充数组子类的继承 `toJSON()`：同一密集数组值保持不变，闭包改变时真实 map 来源已经不同。修复前准入与实际消费两项失败、15项控制通过；数组现在必须使用标准 `Array.prototype`，普通密集数组仍可缓存。
- 新增基线合并控制最初只覆盖 isMainChunk，错误要求共享基线引用隔离，保留该失败日志；改用嵌套 `postcssOptions.options.from` 的真实局部覆盖，使前一配置与本轮配置具有独立合并结果，不为测试更改产品深拷贝语义。
- 最终12个文件94项回归通过，禁止更新快照；显式7个 TypeScript 文件 lint、包构建与声明、规则检查、发布状态和 diff 检查通过。原严格检查仍准确失败于两处受保护作者阶段接口，未改变编译参数。
- 原完整文档测试中的自定义 stringifier 命中控制明确调整为逐次执行，并增加调用增长断言，保留原 CSS、来源绑定和输出隔离断言；另外验证默认 serializer 的文档改变仍失效、等价来源仍命中。历史 Input.document 修复证据继续保留，未将其误作通用回调纯度证明。

## 适用边界

本次仅修处理选项的缓存准入，不证明所有插件工厂回调安全。pxtrans 的 designWidth 实例缓存、preset-env 插入插件、外部自动 source map 输入、完整作者／平台阶段屏障、Document 解析与保护占位还原仍需独立设计。map 开启时既有结果克隆可能再次字符串化，不承诺回调恰好执行一次，也不宣称完整 source map 所有权已解决。

未改变性能预算、回归快照或后端。包内 noCheck 构建不能替代严格类型验收；原两处作者阶段受保护接口错误及正式性能／全端验收阻塞保留。

## 规则评估

沿用现有缓存身份与根因回归要求，不新增 AGENTS。缓存资格必须同时约束最终结果和上游配置复用，不能只在最后一个命中点补救。
