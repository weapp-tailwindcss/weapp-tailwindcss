---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 47676885ed7793dabcefefa1d58404a9983a031f
regressions:
  - e2e/react-native-web-evidence.test.ts
  - e2e/react-native-compatibility.test.ts
---

# React Native Web 验收必须读取实际样式

## 症状

检查静态 export 的 Web helper 时发现：computedStyle 等待超时后，旧代码仅检查节点尺寸以及 bundle 含三个字符串，就返回固定蓝底白字。它甚至允许 theme 节点不存在，不能证明实际渲染成功。

## 根因与纠正

旧注释把 CSSOM 规则存在但节点未绑定样式当作 hosted 环境的可接受状态，混淆了构建和渲染证据。删除整个成功兜底；保留真实页面状态、浏览器日志、失败截图和原始异常。截图也失败时同时保留两项错误。

页面显式使用 light 媒体环境，与示例的 bg-blue-500/text-white 契约一致。等待和最终读取均要求实际蓝底 rgb(43,127,255)、白字 rgb(255,255,255)；红底或默认黑字虽非透明仍失败。返回值仅来自实际节点。浏览器启动、关闭失败也通过 finally 关闭本轮 HTTP 服务。

## 验证

- 新增四项回归在旧实现全部失败：透明背景配合 manifest 字符串、错误背景、错误文字、未固定 light 模式。
- 使用真实临时 HTTP 服务和模拟浏览器错误，验证资源关闭、异常保留与正反例。回归接入既有 RN compatibility 命令。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-web-evidence.test.ts e2e/react-native-compatibility.test.ts --update=none`：首次修复后 13 项通过，包含真实三端 Metro export、后台 Chromium 的蓝底白字与尺寸验证，以及 6 项定向断言。
- 补充截图失败的错误聚合回归后，定向 7 项通过；真实产物代码未再改变。

## 适用边界

历史静态 export 测试可能走过兜底，其成功不能作为严格渲染证明。此修复不代表历史 CI 一定发生了该问题；独立 Web HMR 入口原本就读取实际变色，未经过这个兜底。真实 Android/iOS 仍需原生运行证据。

## 规则评估

不新增 AGENTS 规则，移除与既有证据要求矛盾的实现并固化反例。构建字符串、CSSOM 规则和布局尺寸均不能替代待测视觉属性。
