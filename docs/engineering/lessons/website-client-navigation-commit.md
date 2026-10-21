---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 9e34203becf535b374817d620ae7d62f99609e50
regressions:
  - website/tests/navigation-link.spec.ts
  - website/tests/index.spec.ts
  - website/tests/navigation-readiness.spec.ts
  - website/tests/navigation-document.spec.ts
---

# 网站客户端导航必须等待路由提交

## 症状

本地全面验收的第 24/57 阶段在 Firefox 访问首页时报告 `NS_BINDING_ABORTED`。失败发生在 React Native 与 Lynx 双语文档链接测试；前 23 阶段通过，该浏览器阶段 1039 项通过、14 项跳过、1571 项未执行，后续阶段未调度。

本轮准确源码为上述 baseline，Node 24.18.0、pnpm 12.14.0、macOS arm64。全面流程消费预检 `10e655ed-e9ad-4b76-b3e0-a35650a798d0` 的一次性 lease；脚本探针、当前会话 computer use 与 verify 均通过。失败后服务与预检已收尾，不能将该报告用于新的全面运行。

## 根因与纠正

测试点击客户端链接后只等待 URL。Docusaurus 会先更新 history，再异步加载路由模块。trace 显示下一次 `goto('/')` 开始时，RN 文档 chunk 尚未完成；取消脚本导致 `ChunkLoadError`，框架的 `PendingNavigation` 错误处理发起旧文档 reload，抢占新的首页导航。

链接导航现在复用已有文档、响应、字体及非统计资源连续空闲的核对边界。监听器在点击前安装，同时等待目标 URL 和调用方声明的已提交页面节点；完整就绪后才允许下一步硬导航。硬导航的 HTTP、缓存及文档身份检查没有放宽，不捕获 abort 放行，也不增加生产等待时间。

新增回归在真实站点阻塞路由 JS，证明 URL 已更新时导航仍不得成功；释放模块后要求文档标题可见，再验证返回首页。修复前 Firefox 确定性失败，得到“Expected false / Received true”；修复后原双语链接测试与新增反例在三引擎均通过。

## 验证

- 原全面命令：`pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5 --preflight-report e2e/.artifacts/preflight/10e655ed-e9ad-4b76-b3e0-a35650a798d0/report.json`，结果失败，保留第 24 阶段 trace、完整日志和内存报告。
- 使用本轮构建的独立本地 Worker，Playwright local-worker 配置、`CI=1`、headless、retries=0、`--update-snapshots=none`：新增导航反例及原双语链接测试三引擎共 6 项通过。未更新页面截图基线，变更仅涉及测试导航生命周期。
- 扩展执行导航缓存、诊断、文档、链接、就绪及超时六个 spec 的三引擎回归：116 项通过、28 项按既有引擎条件跳过、0 失败；共登记 144 项，不能把跳过项计为执行成功。
- 原完整流程的全仓单测为 980 文件通过、5 文件跳过；10568 项通过、1 项预声明预期失败、44 项跳过。该历史结果绑定 baseline，不能代替之后新增提交的全面结果。

## 适用边界

目标 ready 节点必须能证明新路由已经提交，不能使用旧页面也存在的通用可见节点。URL、路由模块交付、页面提交和资源就绪是不同事实，均需按动作合同核对。

第 25–57 阶段及独立 Tailwind 15 目标本轮均未执行，整体仍为 partial。新源码的全面流程须重新完成 prepare、当前会话 computer use 与 verify；定向网站回归不计作全端验收。

## 规则评估

不新增 AGENTS 规则。已有“首次页面与请求必须一致”和浏览器资源生命周期要求足以约束，补可执行时序回归和统一导航入口。
