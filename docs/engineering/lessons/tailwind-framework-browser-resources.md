---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: c0fce85fd52f554cccec41c472fe40fc639c69ea
regressions:
  - e2e/tailwind-framework-source-server.test.ts
  - e2e/tailwind-framework-source-runner.test.ts
  - e2e/tailwind-framework-source.test.ts
verification:
  - claim: 完整Chromium复现React九例共同favicon404
    kind: integration
    status: failed
    sha: c0fce85fd52f554cccec41c472fe40fc639c69ea
    environment: macOS arm64、Chromium156.0.8078.4；生产runFrameworkSource；除no-page-errors外语义断言均通过；保留原CI失败，不重跑
    command: pnpm exec tsx .tmp/framework-resource-repro.mts
  - claim: 修复后真实React与Vue三引擎各18例通过
    kind: integration
    status: passed
    sha: c0fce85fd52f554cccec41c472fe40fc639c69ea
    environment: 同批未提交修复；run74ab5199-52b4-4f7a-afc5-c5dad0e53a70；完整Chromium156.0.8078.4、Firefox157.0、WebKit27.2；headless；各18例、0warnings；不是全端调度
    command: pnpm exec tsx .tmp/framework-three-engine.mts
  - claim: 资源身份和成功及失败生命周期七文件46项通过
    kind: integration
    status: passed
    sha: c0fce85fd52f554cccec41c472fe40fc639c69ea
    environment: 同批未提交实现；CI=1、--update=none；全语义通过时收尾pageerror、HTTP404、requestfailed仍失败；合成页面仅验证runner协议
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-framework-source.test.ts e2e/tailwind-framework-source-runner.test.ts e2e/tailwind-framework-source-server.test.ts e2e/tailwind-browser-lifecycle.test.ts e2e/tailwind-authoring-web-runner.test.ts e2e/tailwind-hmr-runner.test.ts e2e/tailwind-hmr-browser-errors.test.ts --update=none
---

# 真实框架页面资源与生命周期

## 症状

c0的Web Chromium CI中React九例仅no-page-errors失败，Vue九例通过。原件没有请求URL，不能直接推断请求来源；本地同版完整Chromium记录到隐式favicon.ico请求。另一个初始about:blank文档中的crypto.randomUUID异常，在旧的晚注册监听下没有被记录。

## 根因与纠正

独立HTML缺少声明和图标。共用资源工厂现在同时提供HTML、entry、CSS、Probe、package.json与SVG，并供服务和fixtureHash消费。扫描仍仅指向独占Probe，候选没有通过图标、共享source或inline注入。about:blank不生成框架session；真实文档独立生成session并继续核刷新身份。

公共观察器保留console、page、HTTP和request错误的URL、时间、阶段、状态及资源类型，不过滤404。所有错误仍进入最终门禁。每组页面先关闭，再停止其服务；每框架单独保存错误原件。页面拒绝关闭时停止后续框架，由自有context收尾；下一框架setup失败不继承上一框架记录。页面和服务失败截图使用不同名称，不覆盖原件或产生重复回执。

案例筛选统一使用完整Chromium，不能因筛选而切换为headless shell；其它引擎保留其原二进制。自有context/browser按归属清理，借用Browser不关闭。

## 验证

资源回归先失败，页面关闭拒绝回归又暴露跨框架复用及重复回执；修复后七文件46项通过。全成功合成生命周期覆盖18例和每框架12态，另验证全语义正确但晚到错误必须失败；不将合成PNG作为浏览器证据。

真实三引擎原件位于`.tmp/framework-three-engine/74ab5199-52b4-4f7a-afc5-c5dad0e53a70/`。static使用`CI=1 pnpm e2e:tailwind:static:update`重新生成；审查仅fixtureHash改变，生成CSS字节及哈希不变，再以禁止更新模式比较。

## 适用边界

上述证据仅属于本批定向修复。新head CI、fresh预检及全端设备验收必须分别完成。Mpx原性能失败、served bundle和其余注册能力、Web variant等缺口仍保持partial，不把旧head成功转移到新源码。

## 规则评估

现有资源归属、错误不得过滤、fixture身份及预检门禁足以约束本问题，不增加全局规则。
