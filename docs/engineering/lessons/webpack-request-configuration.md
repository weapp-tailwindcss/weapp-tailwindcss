---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 8e8f8ead4c5a1b5de38c63d74e847fa3a8ce3425
regressions:
  - packages/weapp-tailwindcss/test/bundlers/webpack-generator-request.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-scoped-configuration.test.ts
verification:
  - claim: 不同 CSS 来源并发生成时保留各自结果，真实 preflight 或 cssEntries 配置更新仍使旧结果失效
    kind: integration
    status: passed
    sha: 7ed0208eeaee37a34a87faceaba8863aa591156e
    environment: macOS，Node 24.18.0，pnpm 12.14.0，真实配置和生成编排，暂停的样式处理服务
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack-generator-request.test.ts test/bundlers/webpack-scoped-configuration.test.ts test/bundlers/webpack.v5.unit.test.ts --update=none --maxWorkers=1
  - claim: 主包 ESM、CJS、Webpack loader 与声明产物构建
    kind: integration
    status: passed
    sha: 7ed0208eeaee37a34a87faceaba8863aa591156e
    environment: macOS，Node 24.18.0，pnpm 12.14.0
    command: pnpm --filter weapp-tailwindcss build
  - claim: 最终源码的完整验收
    kind: integration
    status: pending
    sha: 7ed0208eeaee37a34a87faceaba8863aa591156e
    environment: 重新预检后的本地多端环境
    reason: 内存诊断和包构建已结束，性能根因及最终完整验收仍未完成
---

# CSS 来源选择不能推进会话配置版本

## 症状

同一 Webpack 会话处理两个已配置 CSS 来源时，A 先开始，B 先完成，随后完成的 A 被当作过期配置结果丢弃。问题发生在来源请求的组装边界，不要求两个项目共享状态。

## 根因与纠正

旧 `scopeWebpackGeneratorOptionsToCssSource` 为每个来源浅复制完整内部配置，裁剪 `cssEntries` 及嵌套字段，再把副本交给生成入口。同一个 runtime owner 因此先观察 A 的配置、再观察 B 的配置，递增全局 profile revision。A 的异步结果完成时，配置校验失败；实际用户配置从未变化。

来源筛选现在通过 `createWebpackGeneratorRequestOptions` 写入当前请求的 `cssHandlerOptions.sourceOptions.cssEntries`。传入生成入口的 `opts` 始终是原始会话配置，配置指纹仍包含真实 `cssEntries`。生产流程与并发回归使用同一个请求组装器；删除旧完整配置裁剪器，避免保留两个含义相近的入口。

显式请求 entries（包括空数组）优先；否则按当前来源筛选顶层或嵌套配置。未匹配的主样式仍按既有规则禁用配置回退，其余未匹配来源保留默认回退。请求数组复制后再交付，不改写用户配置或原始处理选项。路径身份使用已有 `sourcePathApi`，覆盖 POSIX、Windows 盘符、根目录、UNC 和相对路径。

## 验证

修复前，同一个暂停服务的交错测试得到 A 为 `undefined`，来源隔离用例失败；真实配置更新用例通过。修复后，提交 `7ed0208eeaee37a34a87faceaba8863aa591156e` 的三个定向文件共 187 项通过。新增 22 项包含请求组装、路径、并发完成及真实 preflight、entries 更新，其数量包含在 187 项中，不重复累加。

命令见上面的验证记录。实际执行额外使用 `CI=1` 和 pnpm 的 `verifyDepsBeforeRun=false`，只避免独立工作树重复核验安装，没有跳过测试或更新快照。主包 ESM/CJS/loader/声明构建、类型、源码 ESLint、架构检查（37 包、1512 源文件）和 diff 检查通过。没有修改 demo 或样式 static 基线。

原始前后日志保存在忽略目录 `.tmp/framework-isolation/scoped-configuration-before.log` 与 `scoped-configuration-after.log`。前者为一项失败、一项通过；后者包括完整的三个定向文件。

## 适用边界

本回归经过真实 context、profile、生成服务及 pipeline，但使用暂停的样式处理服务，不替代真实 Tailwind、Webpack 产物或设备验收。此修复只删除少量浅复制；仍需创建请求配置快照，不能将它解释为已经解决 Mpx 冷构建或 Uni HMR 的 RSS 超限。

## 规则评估

不新增 AGENTS 规则。已有“配置与请求分离、缺陷补回归”的约束足够，本次通过共享请求工厂和持久并发回归落实边界。
