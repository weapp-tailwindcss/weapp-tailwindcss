---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 3fb14b8c59fd414896f7518f2825b8d652f5ee2c
regressions:
  - packages/postcss/test/uni-app-x-base-messages.test.ts
---

# uni-app x 基础后处理必须交接已有消息

## 症状

基础兼容抽取非空的 --tw-* 默认值并注入类规则后，会生成新的 CSS 结果。新 Result 却未继承原有 dependency、dir-dependency 和 warning 消息。WebView 直接返回该结果；UVUE 虽会保留收到的消息并追加自身警告，但基础步骤返回的新 Result 已丢失此前消息。

## 根因与纠正

Root.toResult 按已修改的真实 AST 重新序列化，并创建新的 Result；它不继承旧 Result.messages。应继续保留该序列化边界，再将旧消息按原顺序 push 到新的消息数组，而不是返回 CSS/map 已陈旧的旧 Result、别名消息数组或把旧字段整体覆盖到新结果。

新数组与旧数组独立，消息、Warning 及其关联的已删除 carrier、Input 仍保持对象身份；消息不必仍指向输出树中的节点。该边界与相邻 UVUE 结果交接一致，不需要私有 PostCSS API 或改变插件阶段。

## 验证

独立依赖的 Node 24 / PostCSS 8.5.32 中，修改产品代码前4项真实回归失败、2项控制通过：单 Root、Document、WebView 和 UVUE 均复现已有消息缺失。回归检查真实 PostCSS 插件发出的依赖与警告、原消息顺序/身份、被删除节点与 Input、CSS 以及真实 map 消费来源；UVUE 继续在旧消息后追加新兼容警告。补充重复处理不重复消息、禁用和无默认值保持原 Result 的控制。

最终7项新用例及相邻 Document、uni-app x、preset 插入和外部 map 缓存回归共5文件82项通过，使用 `pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/uni-app-x-base-messages.test.ts test/uni-app-x-document.test.ts test/uni-app-x.test.ts test/preset-insertion-cache.test.ts test/external-source-map-cache.test.ts --update=none --coverage.enabled=false`。两份 TypeScript 文件通过显式 `eslint --no-ignore`；PostCSS 构建、agents 检查、release status 与 diff 检查通过。原严格入口与继承根 compilerOptions 的新增测试夹具最终均只剩原两处 protected markDirty；未修改类型检查选项。

初次修复后新 Document 夹具错误地要求 sources 仅含两个输入，忽略了注入声明原本具有的 `<no source>` 项；已将该既有原生行为和第二 Root 的真实来源查询明确纳入断言。初次日志保留，该夹具错误不计产品红。

新增测试首次严格夹具另外识别3处类型错误：Input.origin 可能返回 false，不能用可选链假定 FilePosition；WebView 是未声明 UVUE 目标的分支，不是合法的 webview 字符串。已使用真实联合类型守卫和既有目标配置，保留原日志，不用断言或 any 隐藏。

## 适用边界

只修基础后处理的消息交接，不改变现有 AST 转换、序列化及 map/stringifier 行为，不补齐 processor、自定义 Result 字段或完整 source map 所有权。handler 的未知作者插件消息在平台处理结束后另行加入，不能把此缺陷描述为所有作者消息都会丢失。Document 测试只覆盖消息和容器来源，不证明跨 Root 默认值作用域已隔离。

原严格 noEmit 两处 protected markDirty 仍未修复；包内 noCheck 构建不能替代严格验收。本地定向通过不替代远端当前 head、真实 iOS、正式性能或全端验收，原浏览器超时首因仍未知。

## 规则评估

沿用现有结果所有权、节点来源及真实回归规则，不新增 AGENTS。重建原生 Result 的调用方必须显式交接需要保留的消息，不能假设 Root 序列化会继承它们。
