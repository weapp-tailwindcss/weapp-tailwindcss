---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: d4ee686ad35f050ada02b643a3bfb5ab694d72ea
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin-shutdown-retention.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin-slots.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/materialize-error-stack.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-context-release.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-context-retention.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-operation-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/context-source-options.test.ts
  - packages/weapp-tailwindcss/test/bundlers/gulp-session-lifecycle.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/gulp-session-retention.test.ts
  - packages/weapp-tailwindcss/test/bundlers/gulp-vinyl-lifecycle.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/gulp-vinyl-pipeline.unit.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/native-session-close.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/generator-close.test.ts
  - packages/weapp-tailwindcss/test/compiler/generation-pool-close.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-async-cleanup.test.ts
  - packages/weapp-tailwindcss/test/compiler/owner-activity-idle.test.ts
---

# 编译会话关闭后的真实所有权

## 症状

关闭核心会话后，宿主通常仍持有插件、compiler、stream 和关闭 Promise。只清空候选与图关系，或只验证宿主 `this` 可以回收，不能证明框架扩展私有资源、配置回调、handler 和缓存 AST 已释放。

## 根因与纠正

Vite 的静态代理仍保留真实 delegate 和完整 resolved config；Webpack 的常驻 hook 与后续 build 配置均引用完整 Internal context；Gulp 的 stream 闭包解构 handler，并只在实际转换开始后登记活动。它们分别形成保留链或提前关闭风险，需要在各自构建器的生命周期内修正。

Vite 在永久关闭后清空 delegate、owner、bindings、resolved config 和清理回调槽。终态判断先于委托查找，重复关闭复用同一结果；新任务被拒绝，下一次独立配置创建新实例。watch 中间轮次保留有效状态。真实 GC 回归同时持有静态插件数组、关闭结果和宿主，检查实际扩展及 owner 私有资源。

Webpack 将可复用源配置与可变 context 分离。公开组装入口显式转交自建 context，外部 Internal context 保留首次 handler 兼容，同时建立适配器自己的 runtime。永久关闭先排空，再清空扩展清理表、释放自有缓存并断开 handler、刷新闭包及 runtime。调用者显式提供的缓存保持调用者所有权。一个清理动作失败后仍执行剩余动作，最后聚合报告。

宿主接收边界还必须与内部嵌套协作区分。processAssets、mini CSS finalizer 和 loader 原先使用可继承活动租约的入口；handler 异步后续发起关闭后，再调用这些宿主入口会借用祖先租约而错误接收新任务。三个入口改用已有的外部活动接收操作，内部候选与生成协作继续继承已接受租约，保证原任务提交后再释放；不另建关闭协调者。

活动租约失效后还需退出共享异步上下文。`fdbaa8fa168c1930d46cbc596e50a5b881252cd2` 在全部活动结束后仍保持 `AsyncLocalStorage` 启用；实际 Node 22.23.3 会继续向宿主新建 Promise 传播空存储，固定的五十万次 Promise 微实验中，两份空闲启用样本约 53 ms，无存储或停用样本约 20–25 ms。该实验未强制 GC，不是实际框架的性能验收，也不能解释 Taro 的约 186–193 MiB RSS 差额。

共享存储现在按全部实例的在途活动总数管理：最后一个活动完成后停用，下次活动自动启用。不能在单个 owner 空闲时停用，否则会清除其他实例关闭期间仍需继承的租约。同步异常在实际活动作用域内释放；Node 24 的 async context frame 只删除当前 frame 的存储，在 `run` 恢复祖先后才释放会遗留该活动 frame 的失活上下文。用户 ALS 已复制的其他 frame 仍可能读到失活租约，因此继续清空 owner 并检查 active，不能声称全部捕获上下文均已消除。重新启用不会恢复旧任务权限，用户自有的异步上下文保持独立。

Gulp 在 `write` 或 `end(chunk)` 接受文件时登记完整活动，等待 handler、Node write callback 和已发布输出三个条件。受管 pipe 只允许同一 Vinyl 沿已登记的上下游关系继承租约，背压中的输出同样受保护；`unpipe` 和 destroy 解除输出关系，仍在运行的 handler 继续排空。用户 callback 重入属于新外部任务，关闭后不能借用旧异步作用域。session 和转换服务使用可清空槽，未结束的 stream 不再永久捕获完整 context。

V8 的延迟 Error.stack 也可能保留原调用帧。共享诊断 helper 在释放边界物化 stack、cause 与嵌套 AggregateError，循环去重；各访问器分别保护，用户自定义 getter 失败不能遮蔽原始错误或阻止其余子错误处理。错误身份及聚合关系保持不变，测试不能先读取 stack 隐藏问题。

独立 `weapp-style-injector` 公开工厂没有永久关闭契约，本轮保留其既有行为。主包内置代理由父级协调者收束并解除绑定；两个真实 watcher 的更新与删除对照只证明 CSS/JS 行为一致，不能扩大为独立工厂永久释放保证。

关闭所有权还必须到达实际生成后端。原 native pool 用 `void pending.then(dispose)` 调度清理，导致关闭先于在途生成完成，已替换会话也脱离最终关闭；清理异常变成游离拒绝。当前 native pool 保存当前与退役会话的释放结果，返回同一关闭 Promise，排空已接受任务后继续释放全部会话并汇总错误。主包生成器同时排空 CSS 转换和候选校验，再关闭生成与校验后端。生成池、公开 compiler 的 root store 和 owner 兼容桥逐层等待该结果；LRU 与替换产生的失败保留到最终关闭。公开 `dispose` 继续接受同步实现，并允许调用方等待异步关闭。

## 验证

Vite 作者九文件 / 52 项定向回归通过，覆盖普通失败、循环 cause、嵌套 AggregateError，以及平铺和嵌套代理。旧实现真实 delegate/config 私有资源的保留红灯已保存。主树在 `88936874e` 对关闭、slots、嵌套关闭和真实 GC 四文件 / 29 项复验通过。

Webpack 作者十二文件 / 223 项、标准 `noCheck:false` 类型检查、严格 ESLint、架构与 diff 检查通过。主树整合 `2ec91cb1d` 后，context release、retention、session lifecycle、source options 和共享错误 helper 五文件 / 13 项通过，0 跳过。真实 GC 子进程长期持有 compiler、插件及关闭 Promise，并覆盖清理失败。

宿主重入补充回归先在修复前复现五类错误接收（五项失败、原有五项通过），覆盖真实 templateHandler 的异步后续重入 processAssets、finalizer、rewrite/generation/classset loader。整合提交 `54c9db8bc1746fa8fa3595745ff0ed240b13711b` 后，主树实际 Node 22.23.3 执行 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack-operation-lifecycle.test.ts test/bundlers/webpack-loader-session.test.ts test/bundlers/webpack-session-lifecycle.test.ts test/bundlers/webpack-context-release.test.ts test/compiler/owner-activity-scope.test.ts --update=none --maxWorkers=1 --no-file-parallelism`，五文件 / 27 项通过，0 跳过。主包 ESM/CJS/声明构建、标准类型检查、四文件严格 ESLint 与架构检查通过；独立只读复核未发现阻断问题。这是关闭接收语义的证据，不解释 Mpx 正常 HMR 内存差额。

空闲作用域回归在上述 `fdbaa8fa` 上新增测试后先得到五项失败：成功、同步异常、异步拒绝、thenable 拒绝和外部同步异常均能从绑定资源读到失活上下文。归零停用修订首次在 Node 22 下六文件 / 36 项通过；Node 24 仍暴露两项同步异常失败，移入当前作用域释放后，两版本定向回归通过。测试使用实际 `AsyncResource` 和 `getStore` 验证结果，未依赖 Node 私有符号或停用调用次数；另覆盖跨实例排空和用户自有存储。后续正式性能、完整设备和 reviewer 验收仍须单独完成。

该修订在 `fdbaa8fa` 基础的提交前源码上，以实际 Node 22.23.3、`CI=1`、Vitest `--update=none --maxWorkers=1` 执行完整 `test/compiler` 与 Webpack/Vite/Gulp 生命周期定向集，共 57 文件 / 327 项通过，0 跳过。Node 24.18.0 的新增文件八项通过；主包 ESM/CJS/声明构建、标准类型检查、严格 ESLint、架构与规则检查通过。未更改 demo 或产物基线，不把这份回归与微实验当作 Taro RSS 预算的通过证据。

Gulp 作者首批九文件 / 59 项定向回归、标准类型检查、严格 ESLint 与 diff 检查通过。主树整合 `8346e2cae` 后，关闭、真实 GC、Vinyl 生命周期、受管 pipe 及 owner 六文件 / 26 项通过，0 跳过。独立复核随后发现显式缓存所有权还需补齐：不能用实例自己的键集合修剪或清空调用者提供的整个缓存。

`f44a54f48` 在创建会话时登记缓存所有权，同时约束运行中的整体修剪和永久关闭清理。两实例及真实公开工厂先复现调用者条目丢失，再验证成功/失败关闭、另一实例后续命中及最终引用释放。主树以 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/gulp.test.ts test/bundlers/gulp.unit.test.ts test/bundlers/gulp-rpx-warning.test.ts test/bundlers/gulp-session-lifecycle.unit.test.ts test/bundlers/gulp-session-retention.test.ts test/bundlers/gulp-vinyl-lifecycle.unit.test.ts test/bundlers/gulp-vinyl-pipeline.unit.test.ts test/compiler/owner-activity-scope.test.ts test/compiler/owner-lifecycle.test.ts --update=none --maxWorkers=1 --no-file-parallelism` 复验，九文件 / 61 项通过，0 跳过。独立只读复核未再发现实质问题。

主树最终源码的主包 ESM/CJS 与声明构建、标准 `tsconfig.typecheck.json`、48 个修改脚本/源码/测试的严格 ESLint 和 architecture:check 均通过。发布入口、声明、HBuilderX 加载、边界检查器反例与源码行数共八文件 / 123 项通过，0 跳过。架构检查覆盖 37 包、1522 个源码文件，原 53 条组装边和 13 条具体兼容边保持；没有扩大兼容豁免。

native 关闭补充回归先在 `4801004a6` 复现四项提前关闭失败，再验证当前与退役 session、在途 CSS 转换和候选校验、LRU 释放失败、公开 compiler 的临时生成器清理。独立工作树最终二十五文件 / 125 项通过，0 跳过；其中包含公开 ESM/CJS、声明、HBuilderX 同步加载、Webpack loader、真实 Vite watch 与 injector 更新删除对照。主包构建、标准类型检查（含同步消费与可等待关闭的类型回归）、严格 ESLint 和架构检查均通过。该记录是关闭链路的定向证据，整合后的完整验收仍按下述边界执行。

## 适用边界

这些是定向行为与释放证据。最终源码仍须完成本轮新预检后的完整本地验收，以及准确 PR head 的 CI 和 reviewer 审批。历史性能首败及诊断限制保留在[内存证据记录](framework-memory-evidence.md)。

## 规则评估

没有新增规则。根规则已有明确状态所有权、失败继续清理与跨实例隔离要求，本轮用生产关闭路径和真实保留链回归落实；任务队列不另建第二套 phase 或关闭协调者。
