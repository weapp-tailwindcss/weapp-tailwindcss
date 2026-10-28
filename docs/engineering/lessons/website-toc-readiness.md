---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 8ad08a899a7657ae388a9a4967bd5b08494c9668
regressions:
  - website/scripts/full-page-toc.test.ts
  - website/scripts/full-page-toc-policy.test.ts
  - website/tests/full-page-toc.spec.ts
---

# 网站 TOC 截图就绪检查

## 症状

依赖升级后的桌面 Chromium 禁更截图在 `/docs/api/interfaces/WeappTailwindcssStyleInjectorOptions` 出现差异：TOC 的 `Properties` 从旧图的 inactive 颜色变成 active 颜色。标题、页面布局和尺寸一致，差异集中在该链接的颜色。正常导航的重复观测均得到 active；原失败 trace 也包含字体加载完成及两次像素稳定截图。

这些证据不能解释旧 inactive 图的来源。像素稳定不代表 TOC effect 已按当前几何同步，但也不能反推旧图只采了一帧。延迟字体的诊断中，记录的字体状态已经是 loaded，标题几何没有改变，因此不能据此认定字体是根因。本次不修改产品字体监听、滚动逻辑或高亮实现。

## 根因与纠正

采集和复验共用 `tests/helpers/full-page/screenshot.ts`。图片准备并恢复原滚动位置后，TOC 检查只读取 DOM，不滚动、不触发 scroll/resize、不修改 class、不改变视口。它与图片、原生截图或 Firefox 超限分片共用一个 `CaptureBudget`，没有新增秒数预算、重试策略或像素阈值。

判定依据为 Docusaurus 3.10.2 的 `@docusaurus/theme-common/src/hooks/useTOCHighlight.ts`，并核对本站 `src/theme/TOC/index.tsx` 使用的动态链接类：

1. 从准确构建的 `.docusaurus/docusaurus.config.mjs` 读取 navbar 的 `hideOnScroll` 和默认 heading 范围；从 docs/blog/pages 生成 metadata 的 permalink/frontMatter 读取页面覆盖项。只解析生成的纯 JSON，不执行配置模块，不读取 React 内部状态，不用链接级别猜测范围。
2. 只约束可见的动态 `.toc-highlight` 链接；隐藏移动端 TOC、inline TOC 及没有动态 TOC 的页面不受干预。
3. 在有效 min/max 范围内取得全部 `hN.anchor`，保留 DOM 顺序，包括未出现在 TOC 中的标题。零高 anchor 使用最近的非零高父节点几何。
4. `hideOnScroll=true` 使用零顶部边界，否则使用当前 navbar 高度。第一条位于边界下的标题若完全在视口上半区，则视作当前标题；否则取前一标题。所有标题均超过顶部边界时取最后一标题。首标题仍在下半屏时允许没有当前标题。
5. 将当前标题映射到真实 TOC 同页 hash 链接，解码 hash 后比较实际 active 集合。当前标题未被链接时，正确结果可以没有 active 链接。

可见 TOC 目标缺失、重复、hash 无效、结构未知、navbar/heading 配置未知、metadata 路由冲突或几何无效时，不能按“没有 TOC”放行。等待仅观察正常页面生命周期；预算耗尽后抛出错误，`full-page-toc-observation` 保存预算内最后一次观测及预期/实际 active，不在超时后另读 DOM。

准确生成配置及实际使用的内容 metadata 摘要与输出树一起组成采集构建身份，采集前后变化会阻断候选。未被用作内容 metadata 的生成临时 JSON 不影响身份。helper 及 route 调用由现有 `baselineContract` 递归绑定；该前置条件改变后旧合同失效。

## 验证

纯函数及 metadata 负向回归不需要浏览器；真实 fixture 覆盖延迟 effect、永久不匹配、首标题下半屏、未链接标题、真实调用方滚动、编码 hash、零高 anchor、隐藏 TOC、未知结构、最后观测附件与共享预算。

```sh
pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/full-page-toc.test.ts scripts/full-page-toc-policy.test.ts --update=none
pnpm --filter @weapp-tailwindcss/website exec playwright test tests/full-page-toc.spec.ts --workers=1 --retries=0 --update-snapshots=none
```

fixture 只能证明检查合同，不能充当网站黄金图。新前置条件要求对受影响路由的新候选定向检查并审查语义差异，再走正式候选采集、审查和安装流程，最终禁止更新复验。不得把旧 inactive 图的未知来源写成已解决的产品缺陷，也不得给新截图套用旧基线身份。完整本地验收仍受本轮多端预检和当前会话 computer use 门禁约束。

整合后，53 项定向 Vitest 回归、网站 TypeScript 检查、33 项三浏览器 TOC fixture 与 3 项既有整页截图 fixture 均通过，零重试。共享截止时间的真实浏览器用例使用 1000ms 总预算、800ms 前置准备与余段小于 700ms 的判定，保留错误重领 1000ms 会失败的语义，避免极小调度阈值误报；生产预算没有改变。新基线迁移与网站禁更仍待执行。只读加载当轮真实双语生成目录得到 317 条内容路由：中文 160 条、默认语言 157 条；5 个 max=4 的文档在双语各出现一次，共 10 条，其余为 2..3，无重复。该读数只确认生成布局与范围解析，不证明浏览器已经就绪。

## 适用边界

此检查绑定 Docusaurus 3.10.2 的动态 TOC 合同，不覆盖 iframe、shadow DOM 或其他站点的高亮算法。页面没有可见动态 TOC 时不读取可选 metadata；动态 TOC 可见时必须有本次构建的有效路由配置。构建 metadata 不能拿另一轮或另一站点的输出替代，逻辑路由仅统一 URL 编码和末尾斜杠，规范化冲突会拒绝。

## 规则评估

问题属于视觉采集的语义前置条件，现有工程规则已要求来源身份、真实浏览器和禁更复验。流程说明落在网站 README，本复盘保留上游算法依据与未知原因，不在根 AGENTS 增加特定路由、等待时长或字体推断。后续升级 Docusaurus 时须重新核对上游高亮算法及生成 metadata 格式。
