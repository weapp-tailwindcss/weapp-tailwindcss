---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1214
baseline: a9c7ffe42cb0ae99463009cc7b12350c1f4bc42e
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-watch-css-output.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-watch-css-post.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.hmr-version-matrix.test.ts
  - e2e/issue-1241-watch.test.ts
  - e2e/issue-1241-style-removal.test.ts
  - e2e/issue-1241-style-removal-ide.test.ts
---

# uni-app watch 空样式产物的提交与清理

## 症状

删除整个 Vue style 块后，页面模板已更新，但旧 WXSS 仍保留主题覆盖。此前无 weapp-tailwindcss 的精简项目也复现同样问题，证明问题并非本库 calc 求值器造成。

## 根因与纠正

uni-cli-shared 的 vite:css-post 每轮重新收集 CSS chunk，并生成样式字符串；字符串为空时，其 generateBundle 直接跳过 emitFile。Rollup watch 不会据此删除磁盘上的历史资产，所以浏览器/小程序继续读取旧样式。

本库既有 uni-app 小程序 watch 适配入口增加输出生命周期适配：截获该 CSS 插件通过公开 PluginContext.emitFile 发出的命名资产，记录它实际负责的输出。下一轮没有对应输出时，通过同一 bundler API 发出空资产，让框架已有后缀转换与写盘流程完成覆盖。没有扫描输出目录，没有猜测源码或平台文件名，没有直接 fs 改写构建输出，也不访问框架私有样式 Map。

记录分为生成中的 pending 和写盘后的 committed。只有 writeBundle 到达后才推进成功产物记录；框架生成失败或后续阶段未写盘时，旧记录仍可供下一轮清理。多输出按 Rollup 的 dir/file/format 身份隔离，关闭 watcher 释放状态。保留原 hook 的元数据；本轮其他生产者已提供的同名资产不被空写入覆盖。首次空样式不会凭空创建文件，复原后再次删除仍有明确归属。

此适配沿用 uni-app 小程序 watch 的现有开关边界；生产构建、H5、原生 App 和非该框架链路不被顺带改变。

## 验证

本轮日志位于 e2e/.artifacts/style-removal/。最初真实 watch 已完成全部20轮行为断言，随后仅因新增阶段未写入快照而失败；限定-u更新基线后，不更新复验。旧18轮基线未降低断言，page-author-remove 恢复为删除整个 style，新增恢复样式和空 style 两轮。

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-watch-css-output.test.ts test/bundlers/vite-watch-css-post.unit.test.ts test/bundlers/vite-plugin.hmr-version-matrix.test.ts --update=none
pnpm --filter weapp-tailwindcss build
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1241-watch.test.ts e2e/issue-1241-style-removal.test.ts --update=none
```

单测覆盖删除/复原/再次删除、框架抛错、后续未写盘、只生成不写盘、其他生产者、未命名资产、hook元数据、生命周期释放，以及POSIX、Windows盘符、根目录、相对输出配置；Vite多版本真实集成保持通过。IDE入口为同配置下的e2e/issue-1241-style-removal-ide.test.ts，显式设置E2E_IDE=1和E2E_PREFLIGHT_WECHAT_CLI。

最终本地结果：25条单测与Vite版本集成通过；主包构建、严格类型、架构、ESLint、规则及change intent检查通过。限定static更新后，三个页面场景和含20轮的watch用例共4条测试以--update=none通过。DevTools同一watch进程中的初始覆盖、整块删除、恢复、空style四阶段全部通过：工具类/直接rpx宽度依次为32/33、33/33、32/33、33/33px；删除后工具类背景也从红色恢复为主题蓝色，四张截图已人工核对。环境为DevTools2.02.2609231、基础库3.16.3、WebView、窗口宽390、DPR3。

证据为e2e/.artifacts/issue-1241/style-removal-ide/evidence.json和同目录四张PNG；watch输出与干净构建对照保存在issue-1241/workspace/watch/。整块删除和空style均实际发出空资产，不再依赖保留其他样式声明规避问题。

## 适用边界

这是随 weapp-tailwindcss 生效的框架适配，不表示移除本插件后上游独立链路已修复。不处理本适配启用前已经遗留的未知历史文件，也不清理无明确本轮生产者归属的任意输出。未发 npm 版本，发布包复验前不关闭 #1214。

## 规则评估

不新增规则。已有“通过 bundler API 修改产物”“归属来自生命周期和产物图”“失败构建不得推进成功状态”的要求覆盖本问题。不能用保留空样式源码、后置读取业务文件或直接删除输出文件作为库侧修复。
