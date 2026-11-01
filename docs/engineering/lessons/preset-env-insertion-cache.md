---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 76f11657db467d37e45e3c3d1d7114bfd68a5439
regressions:
  - packages/postcss/test/preset-insertion-cache.test.ts
---

# preset 插入扩展属于实际执行与缓存身份边界

## 症状

通过 `cssPresetEnv.insertBefore/insertAfter` 插入插件后，同一 handler 的第二次调用可能返回上轮闭包产生的 CSS，空 CSS 第一次调用甚至不执行能够生成规则的插件。更换带私有颜色字段、同名继承 prepare 的合法插件实例时，合并配置和处理器还可能保留旧实例。

## 根因与纠正

handler 只把 `postcssOptions.plugins` 当外部执行扩展，遗漏 preset-env 自身按 feature 注入的插件。实际 postcss-preset-env 11.6.1 为插入项建立独立 feature；即使 stage 为 false，插入插件仍应在原 preset 位置执行。原文特征探测却会在空 CSS 上省去整个 preset 节点。完整结果缓存也会跳过本应由每轮 LazyResult 调用的 prepare。

原函数指纹已用 WeakMap 区分普通闭包，不能把不同函数误当这次碰撞原因。真正缺失的是私有状态实例身份：defu 保留 class 实例，上游 PostCSS 支持其继承 prepare，但可枚举字段指纹只看见相同 postcssPlugin 名称。

插入映射有条目时，仅关闭完整结果缓存和原文特征裁剪，不改变 preset 位置，也不把插入项迁入作者分阶段分支。合并选项 key 同时补充 base、顶层和 canonical override 的插入身份，命中时再次核对缓存条目；Pipeline/Processor 使用 resolved 的实际插入对象身份，并保留原完整指纹处理标量变化。数组按顺序处理实际元素，插件包继续包含子项身份，不使用配置 map 或数组外壳身份替代内容。

访问器、非标准数组、循环或反射异常不取得配置与管线缓存资格。准入检查只看属性描述符，不提前执行访问器；实际配置仍交给原构建链读取。相同正常插件实例继续复用处理器，每轮的 prepare 仍执行；默认及空映射保留完整结果命中。

## 验证

独立 worktree 的 Node 24.22.1/pnpm 12.15.0、实际 PostCSS/preset-env 依赖：修复前9项真实回归失败、4项控制通过，覆盖文本与无消息 Root 的闭包、首次空 CSS 生成、class 合并与处理器碰撞以及 base 配置替换。两次早期新夹具原位修改共享子对象，却要求旧对象不变，属于测试别名错误；已改为替换外壳，原日志保留，不计为产品红。

回归同时检查当前 dependency 消息、输入 Root 不变及来源绑定、canonical 配置、缓存条目被替换后的复核、新 map/数组外壳下同插件复用、原位 stage 改动的真实 CSS 差异与受控 map getter。数组展开访问器只检查准入不调用，不当作完整上游数组扩展语义验收。额外嵌套插件包的候选测试未成立：PostCSS normalize 只展开一层，preset 本身已占用这一层，不能套用直接注册插件包的运行时预期；该失败和类型错误日志保留，不计为产品红，也不为其修改上游执行语义。所有正常回归禁止更新快照。

原标准严格 noEmit 仍失败于两处作者阶段 protected markDirty；新增测试另以继承原根 compilerOptions 的夹具检查，同样只报告这两处错误。没有修改 flags、noCheck 或源码范围，包内 noCheck 构建也不当作严格通过。显式 lint 的初始两处导入/排版错误保留并修正。

## 适用边界

本次关闭上述已复现插入配置的缓存与特征裁剪缺陷。子项身份检查不证明嵌套插件包的运行时执行，也不证明任意不透明配置或插件工厂状态；不改变 defu 的普通对象合并/构造时捕获契约。完整作者/平台阶段、Document/custom parser、wholeCSS 保护与 source map 所有权仍未完成，不使用 private/protected 桥接或假 AST 改动规避。

本地定向通过不替代新 head CI、正式性能预算、真实 iOS ABI 或全面验收。原 browser 超时、历史 RSS 首因、strict2、全面测试与正常审核阻塞保留。

## 规则评估

沿用已有缓存身份、实际插件生命周期与缺陷回归要求，不新增 AGENTS。扩展入口必须同时进入执行准入和上游缓存身份，不能只禁用最终命中。
