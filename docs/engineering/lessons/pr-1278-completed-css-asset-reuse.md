---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1278
baseline: 46f2a10bc1c5001a0bce8def5dff64862e6f1d81
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-css-processed-source-identity.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-transform-decision-plan.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-source-output-relations.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
---

# PR #1278 首次完整构建的 CSS 资产重复生成

## 症状

基线提交的 PR Gate run `37901735582`、attempt 1 中，`uni-app-x-vdom-tailwindcss-v4` 的 Node 24 Portable 任务在 Windows、Ubuntu、macOS 分别由 job `113728486774`、`113728487500`、`113728487496` 报错：`Static baseline: uni-app-x-vdom-tailwindcss-v4:h5`。生产构建已完成，尚未进入开发服务和 HMR 验证。

实际 CSS 同时包含 `.25rem` 与 `0.25rem`，颜色 alpha 同时包含 `.8` 与 `0.8`。这不是仅需更新序列化基线的差异：同一局部规则被重复生成，并重新合并进已完成编译的 CSS。三平台的精确 job JSON、完整日志与 artifact 保存在忽略目录 `e2e/.artifacts/issue-1271-production-watch/cicd/46f2-vdom-*`。

## 根因与纠正

此前的[来源／产物归属修复](pr-1278-css-source-output-identity.md)使 CSS memory 能按绝对来源找回 SFC 作者样式。资产处理身份的另一个入口 `css-asset-identity.ts` 却仍直接查询 Rollup 相对 `originalFileName(s)`，没有使用 Vite root，因此无法确认框架已经处理过的 SFC CSS。

后置 adaptor 取得含 `@apply` 的 remembered 作者源码后再次生成，并把已经压缩、合并的当前 CSS 当作作者贡献合并。相同声明以不同数字拼写再次出现。临时 hook 证据显示页面 CSS 在 `weapp-tailwindcss-adaptor-post` 前为 11013 字节、没有 `0.25rem`，处理后为 15458 字节、出现 21 次 `0.25rem`；finalizer 没有继续改变该内容。诊断插桩已在 finally 中恢复。

修复由两个负责边界共同完成：

- [资产身份解析](../../../packages/weapp-tailwindcss/src/bundlers/vite/css-asset-identity.ts)接收当前 Vite root，仅对来源元数据调用共享 `sourcePathApi(root, source).resolve(root, source)`。两个插件 runtime 提供配置 getter；不从产物文件名推导源码布局，也不在 generateBundle 临时读取源码。
- [CSS 决策](../../../packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/css-transform-decision-plan.ts)接收明确的资产来源。首次完整构建中，只有已处理、归属为 bundler-generated、具有已知来源、当前 CSS 已无生成或 apply 指令，且无需主样式 scoped 重生成的资产，才复用框架已经完成的结果。remembered 原始源码仍保留供增量阶段使用。

单独的 `bundler-generated` 标签不足以证明生成完成。扩大回归时，旧 bundle 测试中的最小替身把没有来源的 placeholder 泛称为 processed，暴露了过宽复用条件；修复要求显式 `sourceFile` 后，旧测试无需修改即可全部通过。增量模式仍走原有候选刷新、runtime 与来源变化的重生成路径。

## 验证

命令从仓库根执行，固定 `CI=1`，Vitest 使用 `--update=none`。完整 argv、耗时、退出码和日志在 `commands.jsonl` 与 `cicd/46f2-vdom-*` 中保留。

- 新[持久回归](../../../packages/weapp-tailwindcss/test/bundlers/vite-css-processed-source-identity.test.ts)初版修复前 5 项失败、8 项通过；最终扩充为 16 项，覆盖 POSIX、根目录、相对 root、Windows 反斜杠、跨盘符、来源缺失，以及初次完整构建复用和各项禁止复用条件。
- 最终 12 个定向文件、329 项通过，包含完整 bundle 单测、来源身份、产物归属、真实 uni-app-x 生产 watch、hash、框架 emission、局部回放与 marker 回归；日志为 `46f2-vdom-targeted-provenance.log`。
- 显式设置 `WEAPP_TAILWINDCSS_COMPILER=legacy` 和 `WEAPP_TAILWINDCSS_COMPILER=graph`，分别运行新回归、来源归属、真实 watch 与 CSS asset source 四文件，各 44 项通过。日志以 `46f2-vdom-watch-*-explicit` 命名，并单独保存环境变量。早期误用未被产品读取的 `WEAPP_TW_COMPILER`，对应日志仅保留原始事实，不作为模式切换证据。模式结果与 329 项重叠，不累加。
- 主包 build、typecheck、六个改动 TypeScript 文件显式 `eslint --no-ignore`、architecture 检查通过；`pnpm release status` 确认现有中文 patch intent 覆盖主包，不改版本或发布。

对应 demo 的 static 基线单独重新生成，然后运行不更新的完整验证：

```sh
CI=1 pnpm e2e:demo:matrix uni-app-x-vdom-tailwindcss-v4:h5 --update --build-only
CI=1 pnpm e2e:demo:matrix uni-app-x-vdom-tailwindcss-v4:h5
```

重新生成结果与仓库基线一致，没有 tracked snapshot 差异。完整运行 exit 0，production、initial、replace、add、restore、refresh 均通过；报告为 `46f2-vdom-local-final-artifact/uni-app-x-vdom-tailwindcss-v4-h5/result.json`。最终生产页面 CSS 为 10636 字节，没有重复的 `0.25rem` 声明。测试使用 headless 浏览器，finally 恢复探针源码、关闭浏览器和服务；结束后该任务工作树路径下无剩余进程，端口 `54387` 已关闭。

## 适用边界

verified 指本次已复现并修复的首次完整构建重复生成及上述本地回归，不代表新提交的远端矩阵或四个 Issue 已完整验收。远端必须按新 head 重新核对全部检查、run attempt 和失败 job；旧 head 的成功或条件跳过不能替代新 head 通过。

本轮只运行受影响的单 demo Web 流程与定向测试，没有启动本地全面测试，未操作微信 IDE、设备或登录态。历史 Lynx simctl 超时和 MPX 首轮性能异常仍保留原始失败及有限确认结果，不能由本次 CSS 修复推导其主机根因已经解决。

## 规则评估

不新增 AGENTS 规则。现有构建图来源身份、生命周期缓存和语义证明要求已经覆盖此边界；通过来源与决策持久回归固化约束，保留原 static 断言。
