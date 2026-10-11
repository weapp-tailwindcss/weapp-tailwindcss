# 原始 setup 脚本

2026-09-08 读取公开复现仓库的 [App.uvue](https://gitee.com/my_hujinchen/weapp-tailwind-test-uniappx/raw/master/App.uvue) 与 [首页](https://gitee.com/my_hujinchen/weapp-tailwind-test-uniappx/raw/master/pages/index/index.uvue)，保留其中的 UTS setup 脚本。首页仅增加 PtProbe 的导入，以复用 demo 中实际消费 `pt.root` 的组件。

`withIssue1144Setup` 只替换两个 script 块，保留 demo 模板、主题、样式与 important 竞争样式，并在失败后恢复原文件。它不是完整第三方组件库的替代验收。

持久入口为 `e2e/issue-1144-alpha.test.ts` 和 `e2e/issue-1144-static.test.ts`；alpha 入口显式设置 `E2E_ISSUE_1144_ALPHA=1` 与 `HBUILDERX_CHANNEL=alpha`。
