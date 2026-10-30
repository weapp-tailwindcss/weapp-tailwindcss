# Watch 消费图诊断规则

## 适用范围
- 本目录与由它生成的独立证据，不是正式性能门禁。

## 核心职责
- 保持原始三轮 watch、30 秒总预算、15 秒 nextBuild 与 golden 断言，保存每轮真实 bundle 和静态消费关系。

## 变更原则
- 产品来源统一使用 source-diagnostics 的准备凭证，不另建来源协议。
- 预算内仅复制内存中的 bundle；诊断写盘不能占用或延长业务预算。
- 静态 imports/importedCss 闭包不证明浏览器动态加载顺序；未展开 CSS import 或缺少入口须明确记录。
- 原始失败、证据失败与清理失败分别保存；只释放本次 scratch 和工作负载资源。

## 测试要求
- 覆盖共享与循环引用、缺失资产、未展开 import、初始化失败与 scratch 关闭。

## 推荐验证命令
- `pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs benchmark/version-compare/test/watch-consumer.test.mjs --update=none --maxWorkers=1`
- `pnpm agents:check`

## 提交前检查
- 确认 diagnosticOnly=true、budgetAcceptance=false；不得用此诊断更新正式预算或断言。
