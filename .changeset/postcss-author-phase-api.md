---
"@weapp-tailwindcss/postcss": major
"weapp-tailwindcss": major
---

将存在实际 calc 且配置作者列表非空的原包装器管线改为真实作者／平台阶段，作者完整遍历并序列化后才建立平台处理，直接消费最终根和原顺序消息；移除受保护 AST 方法调用。同一计划保留作者与 preset 实例，每次实际执行新建上下文及库内 pre/post，保留原缓存准入和 handler 后处理边界。

公开 createStylePipeline、handler.getPipeline 及相关类型改为 flat／phased 联合：flat 保留真实插件数组和原生组合；phased 暴露语义节点、内部首 prepare 控制钩子和 Promise 执行器，不伪装为 Processor。调用方应使用 await pipeline.process(input, options, after)，需要原生 plugins 时必须先判断 kind；内部 getPlugins 对 phased 明确拒绝。

Document 作者从逐子 Root 改为一次整 Document，prepare、旧函数、Result 与序列化次数随之改变；原生对象 Once／OnceExit 仍按子 Root 执行。作者替换根及 whole-Document annotation 行为真实交接，属于破坏性迁移。保留首个原生输入／选项与构造错误时点，后阶段自然拒绝，不隐式等待 pending LazyResult 或失败重跑。

作者使用独立 map:false 选项外壳，平台使用捕获的原选项活引用，不新增作者 Result.map 的 prev 注入。现有外部作者递归、保护恢复、框架和 compiler finalizer 以及终态映射限制保持，未承诺修复全部 source map 所有权。
