---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 6c857fe144e583f7aa22a82b943a4fd5c3c451b9
regressions:
  - packages/postcss/test/pipeline-phases/lifecycle.test.ts
  - packages/postcss/test/pipeline-phases/inputs.test.ts
  - packages/postcss/test/pipeline-phases/cache-handler.test.ts
  - packages/postcss/test/px2rpx-callback-lifecycle.test.ts
  - packages/postcss/test/user-framework-plugin-boundary.test.ts
---

# 作者完整完成与公开阶段管线

## 症状

原标准 tools noEmit 入口在其他类型修复后剩下两处 protected markDirty 错误。原作者包装器把内层遍历嵌在外层 Once 中，内层结束会标记共享树为完成；外层既已建立，依赖强行重置节点才能继续访问。它还只转交消息，不消费作者替换根。将受保护方法包装、伪造 AST 修改或建立无用处理器都不能修复执行边界。

## 根因与纠正

管线明确区分 flat 与 phased。只迁移原实际 calc 存在且配置作者非空的包装器路径，保留原生 UVUE 提前返回。作者一次原生归一化，首个 prepare 按真实 Result 捕获 parser 完成后的选项引用并建立独立 map:false 外壳；完整作者序列化后才建立平台 LazyResult，平台原生构造负责后续遍历状态。消息在平台首 prepare 转入独立数组，最终根直接交接，不新增 Result.map 的 prev 注入。

phased 的同一实际 recipe 同时提供语义节点与执行。内部首 prepare 控制钩子公开登记；作者、preset 和第三方成员实例保留，每轮只新建 ctx、库内 pre/post 与平台 LazyResult，实际运行选项继续登记 selector stable。保留 Processor 容器由原生直接 concat 成员，不在每轮重新读取成员 postcss/getter。第三方与上游 Logger 闭包仍共享，不能称全部 preset 并发隔离。

公开联合类型和整 Document 行为登记独立中文 major intent。flat 保留真实插件数组／node.plugin；phased 只能使用 Promise 入口。首个原生 process 的同步构造错误保持，后阶段自然 reject，无同步失败后重试。after 仍是平台原生尾列表。handler 只改核心执行分流，外部作者递归、缓存准入、保护恢复、克隆、框架及 compiler 终结保持。

## 验证

当前为基线加本地未提交改动，使用本 worktree 独立依赖。三文件30项产品回归通过，覆盖真实 preset、消息／Root／Input／opts、保留构造成员、四轮运行状态、Document、Result／LazyResult、有效空 Processor、原错误及实际 handler 核心缓存。原 tools noEmit 已从两错变为零错；新测试使用继承相同严格选项的夹具也为零错。包内普通构建自带 noCheck，不能作为严格验收。

首次新 flat 夹具误读原生 sync().css（尚未 stringify），改为核 sync().root 与 LazyResult.css。另一夹具把带 getter 的插入成员误当可缓存，拆开验证原有保守旁路与显式计划内成员稳定；未放宽准入。新严格夹具起初位于系统临时目录而缺 type roots，显式绑定本 worktree 依赖后发现并纠正三处新测试类型问题：内部 source 字段的结构化参数、有效空原生 Processor 与可空首节点。首轮原件保留，均不是产品失败。后续 lint 纠正误重命名了既有测试的已用变量而遗漏引用，包回归准确捕获一项 ReferenceError；补回同名引用后182文件再次通过。独立审阅还把首同步错误从深相等加强为捕获后的逐对象身份断言；该加强新增的 map 身份断言也按 true／对象原生类型域显式收窄。

额外包级 noCheck:false 入口还会覆盖原 tools 范围以外的既有测试及 native 源码错误，不能与原198→2基线混称同一入口；该范围尚未完整修复。包级回归182文件2057通过、原3跳过；实际 compiler 消费者四文件14通过，构建／19个 TS 文件显式 lint／agents／release status／diff 检查通过。两位代理只读复审实际源码、测试和中英文公开说明；新提交 CI 与本地全面验收仍待完成。

## 适用边界

Document 的 prepare／旧函数／Result／作者序列化从每子 Root 一次改为整 Document 一次；对象 Once／OnceExit 保持原生逐子 Root。替换根及 child annotation 处理可观察地变化，须按 README 迁移。终态 source map 与后续保护／framework／compiler 改写的坐标所有权仍是既有独立限制。没有修改性能预算、快照、严格开关、平台环境或账号状态；没有本地全端或正式新 head 性能验收。

## 规则评估

不新增 AGENTS。用明确 API 所有权、实际执行配方和持久回归替代包装器内部状态修改，既有规则已覆盖所需边界。
