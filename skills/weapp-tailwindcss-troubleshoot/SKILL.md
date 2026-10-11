---
name: weapp-tailwindcss-troubleshoot
description: 诊断 weapp-tailwindcss 与 `weapp-tw` CLI 的样式未生成、JS/模板 class 未转译、classNameSet、@source/cssEntries、source candidates、rpx、伪类/custom variant、组件隔离、Rspack、压缩、watch/HMR、H5/Web/App/uni-app x 多端产物问题。Use for debugging, troubleshooting, CLI output failures, classes not working, broken hot reload, wrong output, or runtime compatibility；不用于新项目配置、自研 API 设计或 Lynx 专属接入。
---

# weapp-tailwindcss troubleshoot

从生成、转译、产物到运行时逐层定位根因，避免用配置猜测掩盖症状。

## 诊断顺序

1. 收集最小复现：框架、bundler、目标端、版本、命令、原始 class、期望与实际产物。
2. 读取 [references/symptom-matrix.md](references/symptom-matrix.md)，先归类症状，再执行对应最短路径。
3. 检查 Tailwind 入口是否为纯 CSS、是否实际进入构建图、`cssEntries` 是否为绝对路径、`@source` 是否覆盖源码。
4. 检查是否存在第二个 Tailwind 生成器，或 H5/Web 被错误 `disabled`。
5. 分别验证 CSS 候选、模板/JS safe class、最终平台样式文件和真实页面；不要只看固定的 `app.wxss` 文件名。
6. watch/HMR 问题要在同一进程连续新增 class，区分首次构建成功与增量图失效。
7. CLI 问题先确认 `web`/`weapp` target、stdin/stdout、source map 与 watch 模式，不期待它改写模板或脚本。
8. 只有根因确认后才修改配置，并补一条可重复的回归验证。

## 安全边界

- JS 转译只接受 Tailwind 验证过的 `classNameSet`；未命中时修复扫描或刷新时序，不启用启发式全字符串转译。
- `space-*` 先处理结构和组件虚拟节点，再最小扩展 `cssOptions.cssChildCombinatorReplaceValue`。
- App WebView 兼容必须记录 Android Chromium、iOS WebKit 或 Harmony/HBuilderX 环境，并以真实运行截图或日志为证据。
- 不为排障临时加入 `@tailwindcss/vite` 或 `@tailwindcss/postcss`。
- ReactLynx/Rspeedy 构建与 CSS encoder 问题转到 `$weapp-tailwindcss-lynx`。

## 输出要求

先给根因层级和证据，再给最小修复、验证命令、预期结果和未解决时的下一条观测点。
