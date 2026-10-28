---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: b42daec2b7e4be026814a45c57ed20f9429774ed
regressions:
  - website/src/features/analytics/runtime.test.ts
  - website/tests/analytics.spec.ts
verification:
  - claim: 旧生产配置在 localhost 仍请求 Google、百度脚本并触发两家的统计请求
    kind: integration
    status: failed
    sha: b42daec2b7e4be026814a45c57ed20f9429774ed
    environment: macOS arm64，Node 24.18.0，pnpm 12.9.1，Chromium headless；仅新增回归，产品源码未改
    command: cd website && CI=1 pnpm exec playwright test tests/analytics.spec.ts --project=chromium --grep 相同生产产物 --retries=0 --reporter=line --update-snapshots=none
  - claim: origin 匹配及三浏览器的统计加载、初始上报、SPA、重复初始化和 SSR 回归通过
    kind: integration
    status: passed
    sha: b42daec2b7e4be026814a45c57ed20f9429774ed
    environment: macOS arm64，Node 24.18.0，pnpm 12.9.1，含未提交修复；Chromium、Firefox、WebKit headless
    command: cd website && CI=1 pnpm exec playwright test tests/analytics.spec.ts --retries=0 --reporter=line --update-snapshots=none --trace=on
  - claim: 精确 origin 匹配的 12 项单测通过
    kind: unit
    status: passed
    sha: b42daec2b7e4be026814a45c57ed20f9429774ed
    environment: macOS arm64，Node 24.18.0，pnpm 12.9.1，含未提交修复
    command: cd website && CI=1 pnpm exec vitest run -c vitest.config.ts src/features/analytics/runtime.test.ts --coverage.enabled=false --update=none
  - claim: 原导航资源边界的三浏览器 39 项回归通过，脚本和普通业务请求继续受就绪门禁约束
    kind: integration
    status: passed
    sha: b42daec2b7e4be026814a45c57ed20f9429774ed
    environment: macOS arm64，Node 24.18.0，pnpm 12.9.1，含未提交修复；Chromium、Firefox、WebKit headless
    command: cd website && CI=1 pnpm exec playwright test tests/navigation-readiness.spec.ts --retries=0 --reporter=line --update-snapshots=none
  - claim: 准确 main 基线的旧 next 上报断言与正式主域隔离设计冲突，定向复现超时
    kind: integration
    status: failed
    sha: e769e69b97c88b379a80d3cabca4fa20330b999a
    environment: macOS arm64，Node 24.22.1，原基线依赖，Chromium headless；源码无修改
    command: pnpm --dir website exec playwright test tests/analytics.spec.ts --project=chromium --grep 'canonical 来源跟随 next 配置' --workers=1 --retries=0 --reporter=line --update-snapshots=none
  - claim: 正式 canonical 路径正向上报、next 双域隔离及既有统计协议三引擎 18 项通过
    kind: integration
    status: passed
    sha: 9d8e7a9241935fff91464a7b22f4177c3b3bef31
    environment: macOS arm64，Node 24.22.1，pnpm 12.15.0，含未提交测试修复；Chromium、Firefox、WebKit headless
    command: pnpm --dir website exec playwright test tests/analytics.spec.ts --project=chromium --project=firefox --project=webkit --workers=1 --retries=0 --reporter=line --update-snapshots=none
---

## 症状

本轮网站 WebKit 桌面文档页验收停在资源就绪阶段。首次失败 trace 中，主文档返回 200，hydration 和字体均已完成，唯一未完成的资源是 `https://www.googletagmanager.com/gtag/js?id=G-S81Q4GRTPM`。该脚本来自本轮文档的生产 HTML，不能将这次失败解释为旧文档请求残留。

旧生产配置的持久回归在 localhost 上复现相同边界问题：仍加载 Google GTag 与百度统计脚本。合成提供方同时记录到 Google `g/collect` 和百度 `hm.gif`；这些请求由测试拦截，不发送实际统计数据。

## 根因与纠正

`NODE_ENV=production` 只说明构建模式，无法区分正式部署、本地验收和预览部署。原有 preset GTag、静态百度脚本和百度 preconnect 在生产 HTML 中直接声明网络资源，浏览器解析时便已开始加载，单独保护后续 `gtag()` 调用无法收回这些请求。

变更意图是让统计资源与事件共用运行时部署边界：通过 Docusaurus 正式 `clientModules` 入口读取生成配置的 `url`，在创建任何统计脚本、preconnect 或初始化调用前，精确比较浏览器 origin 与配置 canonical origin。后续 next 部署接入增加正式主域限制：只有正式主域构建及匹配的浏览器来源启用统计；next 和开发构建不注册统计客户端。安全的 `gtag-stub` 保留，普通业务网络资源不受该模块控制。

canonical 部署保留原 tracking ID、`js`/`config` 初始化与首屏自动 pageview。SPA 仍只在 `previousLocation` 存在且 pathname、search 或 hash 改变时，在下一任务发出 `set page_path` 和 `event page_view`，以使用更新后的标题。百度维持原有脚本初始化行为，不新增 SPA 上报。DOM 标识保证同一文档重复评估模块时不重复资源与首屏初始化；SSR 导入不会访问 DOM。

## 验证

新增回归先在旧产品上失败，再验证修复；最终三浏览器共 15 项通过，精确 origin 单测 12 项通过。站点类型检查与本次文件 ESLint 通过。现有导航资源回归 39 项通过，未改导航 helper、超时、忽略规则、视觉阈值或 Playwright 配置。测试使用 Playwright 受管 page/context，由 runner 在用例结束和异常退出时回收。

首次三浏览器回归遇到 Firefox 对 HTTP `.dev` 地址的 HSTS 升级：浏览器将其切换到真实 HTTPS 站点，离开合成主文档。这是 fixture 选址问题。协议差异改在无 HSTS 的保留域测试，并由单测保留 `http://tw.weapp.dev` 的拒绝断言；正式 HTTPS origin 的初始化及 SPA 验证保持。该首失败 trace 与修复前 trace 均保留，未以重试成功覆盖。

原始证据放在任务的忽略目录 `e2e/.artifacts/analytics-origin-regression/`，包含 `before-fix/`、`initial-after-fix-firefox/`、`after-fix/` 和 `navigation-contract/`。整站生产构建、static/视觉基线和扩展完整验收由主流程重新执行，因此本记录保持 `partial`；这里的通过不能替代最终同一提交验收。

2026-10-29 全面依赖验收在旧 next 用例停止：产品已按正式主域隔离，但测试仍等待 next 上报。准确 `e769e69b97c88b379a80d3cabca4fa20330b999a` 原依赖和未修改源码复现相同 60 秒超时；相关产品与测试文件到 `9d8e7a924` 无差异。现将正式 canonical 含路径的正向上报与 next 配置在正式域、next 域的隔离拆开验证；两域均覆盖首次加载、SPA 更新、统计请求与 preconnect/script/queue 为空、业务脚本可用和安全 gtag。三引擎 18 项通过，未改变产品策略、超时或视觉阈值。夹具只替换 generated config URL，仍加载实际构建配置的客户端列表，因此此用例证明运行时拒绝旁路，不能代替 next 构建省略入口的验收。首错与基线复现的 trace 分别保存在 `e2e/.artifacts/dependency-upgrade-20261028/website-analytics-first-failure-9d8e7a924/`、`analytics-baseline-e769/`；修复日志为同目录的 `analytics-fixed-final-9d8e7a924.log`。

## 适用边界

适用于 Docusaurus 3.10.2 及当前私有文档站。回归加载实际站点配置、官方旧 preset 注入实现与实际新客户端入口，并对远端统计提供方使用合成响应；它验证加载边界和调用协议，不证明线上统计服务可用性。其他插件的任意网络注入仍须经整站构建与验收检查。

## 规则评估

不新增 AGENTS 规则。现有“修复负责该行为的模块”“保持导航资源门禁”和“先失败后通过”的要求足以覆盖此次问题，新增持久回归即可。未改变公开 npm 包行为，不新增包版本 intent。
