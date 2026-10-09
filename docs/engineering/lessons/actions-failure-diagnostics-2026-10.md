---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37789027711
baseline: cb407cab3d3633d13d1d2de1ac660464bb6e0752
regressions:
  - demo/__tests__/web-vite-demos.test.ts
  - packages/weapp-tailwindcss/test/ci/actions-failure-diagnostics.test.ts
  - e2e/lynx-fixture-diagnostics.test.ts
  - e2e/lynx-pixel-evidence.test.ts
  - e2e/lynx-structural.test.ts
  - e2e/lynx-text-flow.test.ts
  - e2e/lynx-color-scheme.test.ts
---

# Actions 失败修复与 Lynx 诊断证据

## 症状

[Release 37789027711](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37789027711) 和 CI 的 Unit Test Gate 仍断言 Nuxt `4.5.2`，而 catalog 已解析为稳定版 `4.6.0`。性能任务 [37755384878](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37755384878) 安装依赖后直接生成报告，workspace 包没有 `dist`，三种系统都无法加载 `@weapp-tailwindcss/engine`。

CI 的 Lynx 结构选择器、文字流和颜色模式用例在 Ubuntu 失败、macOS 通过。旧运行只上传内存报告，没有截图、字体或计算样式，无法判断是字体、DPR、浏览器渲染还是夹具状态差异。

## 根因与纠正

Nuxt 版本失败是测试固定了已过期的字面量，不是 demo 配置错误。测试现在要求精确的稳定 `4.x.y` 版本，保留构建入口、catalog 和 `weapp-tailwindcss` 插件约束。性能工作流在报告前执行 `pnpm --filter 'benchmark-performance^...' run build`，使报告使用本轮 workspace 产物。

PR Gate 的 Windows Nuxt 任务随后暴露了 Nuxt `4.6.0` 与 Nitro `2.13.4` 的已知跨平台缺陷：Nitro externals 的字符串匹配把 Windows 反斜杠路径与 `nuxt/dist` 规则比较为不相等，导致 Nuxt renderer 留在外部依赖中。运行时只能加载包内的占位 `manifest`/`precomputed` 模块，于是 SSR 请求报 `Either manifest or precomputed data must be provided`。Nuxt issue [#36467](https://github.com/nuxt/nuxt/issues/36467) 和 Nitro 修复 [#4732](https://github.com/nitrojs/nitro/pull/4732) 已确认这一根因；demo 通过分隔符无关的 `nitro.externals.inline` 正则暂时内联 `nuxt/dist`，保持 Nuxt `4.6.0` 和 Linux/macOS 产物语义不变。

三个 Lynx 浏览器夹具通过诊断包装器保存每个阶段的原始 PNG、浏览器和 Node 版本、平台、viewport、DPR、颜色模式、字体加载状态、计算样式、节点尺寸和 Chromium CDP 实际字体信息。诊断写入失败只记录警告，原始像素异常按原对象继续抛出。CI 的 static 和 focused Lynx 任务在失败时上传带隐藏目录的 `lynx-static` 目录，保留原有错误和像素阈值。

## 验证

- Nuxt demo 配置测试 7 项通过；Actions 工作流回归 3 项通过。
- Lynx 诊断回归 5 项通过，覆盖原始 PNG、实际字体、DPR、计算样式、颜色模式、CDP 探针失败和证据目录写入失败。
- 性能依赖闭包构建通过；报告生成通过，产物包含 `synthetic.json`、`synthetic.md` 和 `replay.json`，78 个 case 均有 3 个稳定样本哈希，门禁 0 violations。
- 真实 Lynx 结构、文字流和 dark 浏览器用例 3 项通过，过滤器之外的 21 项按条件跳过；结构、文字流、颜色模式和像素反例定向组 89 项通过。
- Windows Nuxt 失败已在本地按 Nuxt issue 的最小原因补丁修复，并新增配置契约回归；待下一次 PR Gate 的 Windows Node 22/24 结果确认远端证据。

## 适用边界

本次已修复 Nuxt 断言和性能工作流的确定性错误，并补齐下一次 Ubuntu 失败所需的证据。macOS 通过不能证明 Ubuntu 的 Lynx 渲染根因已消除；本阶段没有修改像素阈值、原生支持基线、公开 API 或样式快照。下一次 Ubuntu 运行取得截图、字体和样式证据后再决定是否需要产品或夹具修复。

三个 Actions 链接中的 [CI 运行 37789026913](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37789026913) 仍应以新提交的 hosted runner 结果复核；本地验证不能替代 Linux 证据。

## 规则评估

不新增 AGENTS。通过工作流回归和诊断回归落实已有的“保留首次失败证据”和“先修复后定向验证”要求。
