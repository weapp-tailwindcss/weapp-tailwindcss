---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - website/tests/index.spec.ts
  - website/tests/visual-context.spec.ts
  - website/scripts/visual-baselines/capture.test.ts
  - website/scripts/visual-baselines/manifest.test.ts
verification:
  - claim: 干净 bc4 的重新生产构建与黄金候选采集完成
    kind: integration
    status: passed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0、Playwright 1.64.1，headless、workers=1、retries=0
    command: pnpm --filter @weapp-tailwindcss/website e2e:visual capture --directory <本轮候选目录的绝对路径>
  - claim: 来源审查安装后，正式三浏览器禁止更新回归全部完成
    kind: integration
    status: passed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: macOS arm64，Node 24.18.0，安装新来源后保持源码和 HEAD 冻结；headless、workers=1、retries=0、maxDiffPixels=5、updateSnapshots=none
    command: CI=1 pnpm --filter @weapp-tailwindcss/website e2e:local
  - claim: 整合后准确 head 的扩展全端验收尚待重新执行
    kind: integration
    status: pending
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: 本地扩展 57 阶段及独立 Tailwind 15 目标
    reason: 本记录只完成网站专项；其他性能、原生与能力缺口不由网站通过替代，后续源码变化需要重新预检
---

# bc4 网站黄金来源与正式回归

## 症状

PR #1314 的文档、样式来源说明和 Lynx 合同发生预期变化，旧黄金来源不能直接证明当前源码。前轮全面流程停在网站阶段，后续阶段未执行；本轮仅对失败负责的网站链路做专项修复验证，不复用已经消费关闭的全面预检。

## 根因与纠正

在干净 `bc4f4c546656a7e52f170433d7647cdb82227b23` 上重新生产构建并采集候选，1,204 项首次通过、602 项按既有移动 Firefox/WebKit 规则跳过，零 capture-failed。与旧 61d8cb 来源比较，1,179 张 PNG 字节相同、25 张变化，无新增或删除。

全部 99 份原尺寸差异切片均已实际查看。general 双语页新增 `cssSourceTrace` 重要注释及默认压缩保留来源说明，桌面和移动端后文随行高下移，未见遮挡或丢字；Lynx 双语仅基线时间和 catalog 身份更新。其余变化集中在控件、表格边缘、徽章及同一静态小程序码的绘制，未见布局或图片边界改变；小程序码的扫码有效性未验证。

审查记录的 notes 误写“98 个切片”，实际 evidence 登记 99 份且全部已查看。本记录和 PR 说明透明纠正该笔误，不静默修改已经安装的不可变 review。来源与切片的摘要仍保留。

## 验证

本轮来源身份：

| 字段 | 值 |
| --- | --- |
| lock SHA256 | `d69cc6c336910e65ac1d8cae8abecce30f5641d26be67e8a96e6db9defa9c32a` |
| 截图合同 SHA256 | `40e59b53885ab105617d64f2d337858be198d098da294a4a654d66792b26d2b3` |
| 实际 build SHA256 | `132ca8b34ac24d3321d655a455cc52b4ce339eeb43b863e42cd886eb70d90054` |
| 采集 report SHA256 | `814825700aa356253ea0465f9c64ab09357fdac0001c25c6910c10af1b3e9edd` |
| Chromium / Firefox / WebKit | `156.0.8078.4` / `157.0` / `27.2` |
| sharp / libvips | `0.35.5` / `8.18.7` |

旧来源经过 verify 后归档至 `.tmp/website-golden-61d8cb-archive-before-bc4/`，保留 PNG、manifest、review 与 archive 索引。新候选为 `.tmp/website-golden-final-bc4f4c5/`，对比和审查切片为 `.tmp/website-golden-bc4-comparison.json` 及 `.tmp/website-golden-bc4-review/`。

正式 `pnpm --filter @weapp-tailwindcss/website e2e:visual install --directory <本轮候选目录的绝对路径>` 完成后，再执行 `pnpm --filter @weapp-tailwindcss/website e2e:visual verify`，两项均退出 0。本记录的 `.tmp/` 均相对于仓库根目录，传给 `--directory` 时实际使用绝对路径，避免与 filter 后的 website 工作目录混淆。早先错误地在 install 完成前启动一次 verify，报缺来源；顺序错误的日志保留，未把它归为源码缺陷或有效验证。

安装后执行 `CI=1 pnpm --filter @weapp-tailwindcss/website e2e:local`，全程冻结本工作树 tracked 源码和 HEAD，也未并发真实性能对照或其他浏览器采集。先行真实视觉管线单测 1 项通过；随后 2,625 项正式矩阵为 **1,989 通过、636 跳过、零失败**，耗时 46.0 分钟。636 是整个矩阵的既有条件跳过，不能与采集阶段的 602 混为同一集合或计为通过。

正式运行保持 `headless:true`、单 worker、零重试、`updateSnapshots:none`、`maxFailures:1` 和原 `maxDiffPixels:5`，没有修改产品、黄金截图阈值或跳过条件。日志为 `.tmp/website-golden-bc4-none.log`；安装与最终 verify 日志分别为 `.tmp/website-golden-bc4-install.log`、`.tmp/website-golden-bc4-verify-final.log`，顺序错误为 `.tmp/website-golden-bc4-verify.log`。

运行 wrapper 退出 0，受管浏览器及 Worker 正常收尾，无清理错误；随后进程检查没有匹配本任务网站路径的残留命令。未关闭用户浏览器、IDE 或其他任务资源，也未保留临时展示页面。

## 适用边界

本轮仅提交两份来源 JSON 和验证记录。新来源对应 bc4 的实际生产构建，不声称其他系统和浏览器版本有相同像素。此结果也不覆盖新提交后的完整全端验收、未执行的平台能力或已知 CI 失败。

现有 golden PNG 与候选、旧来源归档保留在本任务的忽略产物目录；来源 JSON 记录不可变摘要，不能只凭 JSON 或退出码推导缺失 PNG、旧 build 或另一工具版本通过。

## 规则评估

不新增 AGENTS。继续使用现有来源绑定、真实审查、限定安装、原阈值禁止更新验证及自有浏览器收尾规则。
