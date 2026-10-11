---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1278
baseline: 11a0f915073bd4a314e3f20838bacb1d735e315e
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-source-output-relations.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-asset-source.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
  - packages/weapp-tailwindcss/test/compiler/vite-removed-files-port.test.ts
---

# PR #1278 的 CSS 来源与产物归属一致性

## 症状

PR Gate run `37888247185`、attempt 1、job `113689080076` 的第二个单测分片出现三项失败：一项仍断言生成器收到相对 `index.html`，两项真实 Vite 生产 watch 在第二轮丢失 uni-app X Web reset 规则，只剩注释。`cssCodeSplit=true/false` 均可复现。

这是前一轮绝对来源修复暴露的真实回归。不能仅更新断言、回退到相对来源或重跑 CI 求绿。临时恢复旧来源解析时 watch 两项通过，但原 SFC 相对 `@reference` 连续回放仍需要绝对来源身份。

## 根因与纠正

CSS asset 处理已将 `originalFileName(s)` 按 Vite root 解析为绝对来源；产物归属索引的 `recordBundle` 却仍直接登记相对元数据。两个入口为同一源码创建不同身份，例如 `index.html` 与 `<root>/index.html`。

第二轮 CSS 内容 hash 改变后，remembered CSS 中的旧资产因此无法匹配本轮产物。回放流程误将旧 hash CSS 发射到 bundle；随后根样式覆盖去重删除页面实际引用 CSS 中的 reset，而最后的框架同步处理了错误的历史资产。调试日志中可观察到旧资产的 `css replay generated result`，接着是当前资产的 `remove root-covered css rules`。

修复在[产物归属登记](../../../packages/weapp-tailwindcss/src/bundlers/vite/source-output-relations.ts)接收项目 root，仅对 asset 来源元数据使用共享 `sourcePathApi(root, source).resolve(root, source)`。由 [generateBundle 入口](../../../packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle.ts)传入 Vite 配置的 root，使归属索引与生命周期 CSS 缓存使用同一绝对身份。chunk module id 和 bundle asset name 仍按各自的模块图与产物图语义处理；没有从输出名推测源码，没有读取输出目录，也没有额外注入 reset 来遮盖错误归属。

[归属回归](../../../packages/weapp-tailwindcss/test/bundlers/vite-source-output-relations.unit.test.ts)验证 POSIX、根目录、Windows 反斜杠、跨盘符和相对来源；旧资产应被归入当前真实输出，不能成为独立回放目标。[真实 watch 回归](../../../packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts)保持同一进程三轮，验证 reset 唯一性、顺序、最终内容 hash、引用同步，并增加旧 hash CSS 不得重新出现在本轮产物图的断言。原 SFC 作者样式和 reference 回归保留。

生成器单测的 `file` 断言同步为项目绝对 `index.html`。这一项属于既有来源契约更新，与 watch 的产品回归分别处理。

## 验证

命令从仓库根运行，固定 `CI=1`、`--update=none`。完整 argv、cwd、耗时与退出码保存在忽略目录 `e2e/.artifacts/issue-1271-production-watch/commands.jsonl`；日志名以 `cicd-css-source-` 开头。

- 修复前新增归属回归 4 项失败、1 项通过；两项真实 watch 失败和实际 CSS 另有独立日志。失败对照没有覆盖或删除。
- 来源、归属、emission、Vite 5–8 hash 矩阵、真实 watch 和完整 bundle 单测：6 文件、261 项通过。
- 受影响的 memory、删除／导入 shell、历史回放、局部归属及 reset：10 文件、59 项通过。以上两组无重叠，共 320 项。
- 来源、真实 watch、SFC 回归在 legacy／graph 模式下分别 28 项通过，与上面的 320 项重叠，不重复相加。
- 修改的四个小文件显式 `--no-ignore` lint 通过；巨型 bundle 单测强制 lint 的 71 项历史诊断与 HEAD 基线完全一致，没有新增。`pnpm agents:check` 与 `git diff --check` 通过。
- 主包 `pnpm --filter weapp-tailwindcss run build`、`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`、`pnpm architecture:check` 通过。
- `pnpm release status` 确认已有中文 patch intent 覆盖主包；仅补充本次归属修复，不改版本、不发布。

只增强现有临时编译测试的断言，没有新增或改动持久 demo、复现页或输出 fixture；没有 e2e static 基线语义变化，也没有更新快照。

## 后续单测替身契约

`a6d6eb3f9240768adbb9d7d684a113d5b2875d0a` 的 run `37893486945`、attempt 1 中，上述 watch 回归所在分片 2 已成功；分片 1 job `113705174826` 出现一项新失败：`TypeError: context.getResolvedConfig is not a function`。精确 job JSON 与完整日志保存在 `cicd/a6d6-quality-shard1-job.json`、`cicd/a6d6-quality-shard1.log`。

[删除文件端口测试](../../../packages/weapp-tailwindcss/test/compiler/vite-removed-files-port.test.ts) mock 了内部生成 runtime，提供的最小上下文却漏掉 `GenerateBundleContext` 一直要求的 `getResolvedConfig` 方法。先前 wrapper 未直接消费该方法，导致不完整替身长期未被发现。真实插件提供 getter；本次应修正测试上下文，不能把产品的必需方法改成可选以掩盖替身缺失。

本地同一文件修复前一项失败。补齐 getter 后，将原端口序列参数化为“getter 返回未解析配置、资产元数据为绝对来源”与“getter 返回 Vite root、元数据为项目相对来源”两种情况；两者都必须按绝对源码删除 CSS、精确模板产物，并且只投递一次删除通知。原删除断言全部保留，仍验证 closeBundle 转发。

本轮仅修改测试和本记录。删除端口、shadow 端口、来源归属、真实 watch、SFC 来源五文件共 33 项通过，命令为 `CI=1 pnpm exec vitest run --project=weapp-tailwindcss packages/weapp-tailwindcss/test/compiler/vite-removed-files-port.test.ts packages/weapp-tailwindcss/test/compiler/shadow-report-vite-port.test.ts packages/weapp-tailwindcss/test/bundlers/vite-source-output-relations.unit.test.ts packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts packages/weapp-tailwindcss/test/bundlers/vite-css-asset-source.test.ts --update=none`。与前述产品验证有重叠，不累加。没有新增发布 intent 或产物基线。

## 适用边界

本记录的 verified 仅指已定位并修复的 CI 单测回归，不代表四个 Issue 已完整验收。Vite 5 manifest 上游问题和微信／原历史 HBuilderX 环境等边界继续见[原验证记录](issue-1271-production-watch-source-identity.md)。本轮未运行本地全面测试，未操作微信 IDE 登录态。

同 head 的 Lynx iOS run `37888246900` 首次在 boot 后的定向设备查询超时；仅失败 job 有限重试一次，attempt 2 job `113685393233` 已成功。两轮证据保留，单次成功不能证明设备查询超时根因已经修复，不为此增加超时或弱化断言。

远端验收必须重新检查本修复提交的全部检查；旧 head 的成功、条件跳过以及排队均不计作新 head 已通过。

## 规则评估

不新增 AGENTS 规则。已有源码／产物身份边界和回归要求适用；通过最小归属回归与真实 watch 的旧资产断言固化本次错误链路。
