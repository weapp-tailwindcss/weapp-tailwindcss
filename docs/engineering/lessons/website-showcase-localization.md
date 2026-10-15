---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/270
baseline: b694506681c78cd26a9c4c0a913f3799eaba0ea7
regressions:
  - website/scripts/showcase-content.test.ts
  - website/tests/showcase.spec.ts
---

# Showcase 结构数据与本地化正文的边界

## 症状

本地全面验收的英文 Showcase 首屏索引位置为 `y=265.21875`，超过原有 `<260` 约束。页面还存在更深层的不一致：中文有 14 个案例、49 张图片，英文只有 13 个案例、46 张图片；英文其中 30 个图片 URL 对应的本地文件不存在，9 个索引链接与卡片标题 ID 不一致。

## 根因与纠正

旧 MDX 把标题、锚点、图片 URL、日期和介绍正文混在同一份可翻译文件中。英文翻译还把生成维护注释变成了可见的 `pnpm showcase:update` 段落，导致首屏整体下移。测试只固定检查 13 个案例和中文标题锚点，未覆盖两个语言的真实资源。

将评论 ID、原始图片 URL、作者和历史日期迁入共享 catalog，MDX 只引用 `entryId` 并保存本地化正文。英文标题与链接展示文本按相同 ID 存储。两种语言共用 `showcase-<评论 ID>` 锚点，同时保留原标题 hash 别名。`ShowcaseCard` 原有参数仍有效，新增的 `anchorId` 为可选参数。

迁移逐字段复核了原中文 14 个案例的全部结构字段、49 张图片地址、历史日期和正文，以及英文原有 13 个标题、链接文本、正文与介绍。缺少的第 14 个英文案例仅依据已提交的中文正文补齐。原 `2026年9月5日 13:04` 更新时间转换为同一时刻的 ISO 值，未使用本次构建时间冒充来源更新时间。

生成器在清理图片或写入产物之前校验英文身份集合、标题和必要正文。源案例有正文时，英文自闭合标签、空正文和仅注释均拒绝通过；源确无正文时才允许自闭合。站点构建也根据中文正文执行同一契约，并检查所有共享图片文件存在。本次没有刷新在线 Issue，也没有执行会清空图片目录的 `showcase:update`。

## 验证

本轮使用 macOS、Node 24.18.0、pnpm 12.9.1，以及基线加未提交修复的独立 worktree。定向浏览器运行使用受管本地 Worker、显式 headless、单 worker、零重试、`--update-snapshots=none`，结束后释放本任务服务和浏览器。

- 修复前的新 Showcase 浏览器回归：Chromium 6 条中 5 失败、1 通过，复现案例数量和稳定锚点缺失。原全面验收的 `y=265.21875` 失败单独保留。
- 正文门禁修复前新增的 2 条单测均失败，分别证明空英文正文漏检和构建未使用中文正文契约；修复后通过。
- `pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/showcase-content.test.ts scripts/seo-geo.test.mjs --update=none`：2 个文件、27 条通过。覆盖真实 MDX 导出、本地化字段边界、生成器门禁和 POSIX/Windows 资源解析。
- `pnpm --filter @weapp-tailwindcss/website typecheck` 与相关文件 ESLint 检查通过。
- `pnpm --filter @weapp-tailwindcss/website build`：双语生产构建通过，生成的英文 LLM 索引恢复正常介绍摘要。
- Chromium、Firefox、WebKit 的双语 Showcase 定向回归共 18 条通过，覆盖原首屏/图片尺寸约束、所有 14 个实际锚点、旧标题 hash、49 张图片 HTTP 状态与浏览器解码。

首轮修复后浏览器运行有 6 条测试在最后的旧 hash 导航处失败：同文档 `page.goto` 合法返回 `null`，不应交给要求新 HTTP 响应的整页导航 helper。修正为同文档导航加 URL/视口断言后通过；保留首次失败记录，未放宽全站导航响应校验。

## 适用边界

保留首屏 `y<260`、索引底部 `<820` 和截图高度 `<260` 等原有断言，未修改 CSS 或容差。原有 8 张 Showcase 视觉基线的审查更新以及再次全面验收由主任务完成；本记录的定向通过不能替代全量或原生平台验收，因此暂记 `partial`。

校验和渲染仅针对目前的受控 Showcase MDX 格式，不作为通用 MDX 解析器。未来新增案例须先补英文标题与必要正文，再运行生成入口。结构变化应通过 catalog 和生成器完成，不能重新在翻译文件复制图片地址或锚点。

## 规则评估

不新增 AGENTS 规则。已有的根因修复、真实资源验证和失败证据保留要求足以覆盖本次问题；维护边界由共享数据、构建门禁和持久回归落实。
