---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40541520612/job/122322652870
baseline: ca5b99e669b1f50f7dbe53e6ee356ea94f1f0896
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.hmr-version-matrix.test.ts
verification:
  - claim: 独立源码根隔离后，Vite 4–8 保持两轮 emitFile 重放并拒绝相邻项目候选
    kind: integration
    status: passed
    sha: 2a83d4d0851d7345b89e0de8033b6964a2d547e4
    environment: macOS / Node 24.22.1 / pnpm 12.14.0
    command: pnpm --config.verifyDepsBeforeRun=false --filter weapp-tailwindcss exec vitest run test/bundlers/vite-plugin.hmr-version-matrix.test.ts --reporter=verbose --update=none --coverage.enabled=false
---

# Vite HMR 夹具的独立源码根

## 症状

手动[完整 CI 的第一单测分片](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40541520612/job/122322652870)中，Vite 4 的 watch HMR 回归超过原有 120 秒期限。Vite 5/6 同轮约 82 秒，Vite 7/8 约 57–58 秒；用例使用预装 Vite alias，没有动态安装依赖。

## 根因与纠正

夹具在临时项目内创建 CSS/JS 源码，却显式将 `tailwindcssBasedir` 指向仓库安装的 Tailwind 包。该位置不包含夹具源码，既有 runtime grouping 按 workspace root 解析源码身份。Vite 的 collector 已识别 inline 候选，runtime 的独立扫描仍覆盖整个工作树；本地原始生成记录达到 29,580 个 class、约 6 MB CSS，真正目标候选只有一个。两次实际 watchChange 与重放事件均正常，未观察到输出触发的 watch 循环。

现在夹具显式设置 `tailwindcssRuntimeOptions.projectRoot` 为当前临时项目，使 Tailwind 安装位置与源码身份分别有明确来源。普通 Vite 未指定外部 basedir 时已有 `config.root` 传播，本轮没有证明这条生产路径存在缺陷，因此只修正该特殊夹具配置，不修改公开包实现或版本。

回归在当前项目之外创建受控 HTML，写入动态 `z-[PID]` 候选，以真实 raw-generation 的 call-through 结果断言当前 inline 候选存在、外部候选不存在。它不替换生成实现，也不依赖全仓候选总数。原 CSS 修改、CSS asset 被移除后的 emitFile 恢复、JS 再次重放以及 120 秒门限全部保留。

## 验证

- 独立工作树在 Node 22.23.4、24.22.1 各执行 Vite 4–8，10 项全部通过，每项约 0.17–0.58 秒。Node 22.23.4 使用官方包并核对官方 SHA-256，不调整机器默认 Node。
- 仅撤去源码根配置的诊断副本在 Node 22.23.4 / Vite 4 上运行 23.958 秒后，确实因外部候选进入真实生成集合而失败；原有 CSS 重放断言先通过，说明新增断言能捕获此前未覆盖的越界。
- 整合到本任务工作树后，在上述准确提交以 Node 24.22.1 复验，5 项全部通过，每项约 0.28–0.99 秒。定向 ESLint、规则与 diff 检查通过。

## 适用边界

这是夹具扫描身份的隔离回归，不代表真实浏览器或全端验收。没有修改 demo、生成样式基线、生产扫描器、性能预算或超时。远端效果仍需新 head 的完整单测分片确认；旧提交的成功不替代这项验证。

## 规则评估

不新增规则。用明确配置及可失败的污染断言维护已有的源码身份边界。
