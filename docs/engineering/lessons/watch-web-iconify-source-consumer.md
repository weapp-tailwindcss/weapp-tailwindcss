---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38117853346
baseline: de3c9f448a265bf6023f3b6a73633b598426de2b
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-web-iconify.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-web-iconify-candidates.unit.test.ts
---

# Web Iconify HMR 探针必须进入真实源码消费位置

## 症状

Taro React 的 Web Iconify content 更新连续两次触发生成，却耗尽 420 秒 HMR 等待预算。对应实际失败 job 包括 `demo-taro-react-default` 与 `taro-vite-react-tailwindcss-v4-weapp-default`。

## 根因与纠正

Taro React 的 Web Iconify 探针曾把类名追加到 TSX 注释。首次全量扫描可以提取注释中的 token，但后续增量链路使用真实源码候选收集器，按设计排除 JS 注释。于是第二次保存触发了 CSS 生成，新的 `before:content` 类名却未进入候选集合，最终消耗完整 HMR 等待预算。

不能为测试放宽业务候选收集器。默认 Web 探针应复用对应框架的 `templateMutation`，把图标与每轮独立的 content 类名写入真实模板消费位置。源码载体不同的配置必须显式提供 `mutate`；没有合适插入位置时直接报告错误，不能退回注释。

## 失败证据

“content update did not preserve icon CSS” 曾同时覆盖缺图标与缺 content 两种断言，不能单凭旧超时文案推断图标消失。每次断言应从同一次浏览器样式读取生成缺失选择器诊断；失败时保存 `live.css` 与 `meta.json` 到既有 Watch 快照目录。超时保留最后一次具体断言，证据写入失败与原始错误一并报告。

CSS 选择器仍由浏览器 `CSS.escape()` 生成，并保留每轮、每阶段独立类名及下一阶段尚未预生成的断言。

## 验证

- `pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-web-iconify.unit.test.ts test/watch-hmr-web-iconify-candidates.unit.test.ts --update=none`：18 项通过。使用实际 engine 收集器复现注释的全量/增量差异，并验证 Taro React 与 Vue 的两次真实载体保存。
- `pnpm --filter weapp-tailwindcss... --filter './packages-runtime/*' run build`：在当前源码工作树重建 29 个依赖包。私有 scripts CLI 直接通过 tsx 执行源码。
- `CI=1 WEAPP_TW_SKIP_AUTO_BUILD=1 pnpm --filter @weapp-tailwindcss/scripts test:watch-hmr -- --case taro-vite-react-tailwindcss-v4 --web-only --skip-build --quiet-sass --timeout 420000 --poll 40 --max-hot-update-ms 420000 --max-plugin-process-ms 60000 --report <临时目录>/report.json`：真实 Web Watch 通过，约 15.5 秒；注入与 content 更新通过，热更新 382 ms，回滚 330 ms。

真实验证使用 headless Chromium。结束后校验模板和样式源码字节摘要恢复，并依据任务进程身份确认没有残留子进程。本变更仅修正测试探针与失败证据，没有修改 demo 或产物基线。

## 适用边界

该默认插入器只适用于与既有 template mutation 相同的源码载体；独立载体仍由显式 `mutate` 定义。没有改变候选收集器排除 JS 注释的业务语义，也没有缩短 HMR 预算、跳过阶段或预生成下一阶段类名。

## 规则评估

现有“真实源码候选”与“失败证据准确归属”边界足以约束此问题，不新增仓库级规则。回归覆盖实际收集器、实际框架消费位置及缺图标/缺 content 的独立诊断，后续新增载体应扩展对应消费者合同。
