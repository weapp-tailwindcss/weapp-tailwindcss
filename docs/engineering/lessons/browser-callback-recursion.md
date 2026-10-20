---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 49b49d6b498bc0fa2243b557985ddd500624f109
regressions:
  - e2e/tailwind-browser-serialization.test.ts
  - e2e/tailwind-web-lifecycle.test.ts
  - e2e/tailwind-web-lifecycle-runner.test.ts
---

# 浏览器回调中的递归采样与 tsx 函数名保留

## 症状

生命周期纯合同通过后，统一浏览器序列化回归指出 `starting` 初始化回调携带 `__name`。新增真实 `tsImport` 加载与隔离 realm 执行回归，明确复现 `ReferenceError: __name is not defined`。

## 根因与纠正

CLI 的 tsx 转译保留函数名，`evaluate` 回调内部的具名变量箭头函数被包裹为模块级 `__name` 调用。Playwright 传输函数本体时，不会携带该 Node 模块的词法环境。Vitest 内直接调用 runner 的 mock 未经过真实 tsx 转译，因此单独的资源合同不能证明回调可执行。

把递归 rAF 采样器声明为回调内部对象方法，通过直接传入的箭头回调继续调度。方法已有语法名称，转译无需注入模块级命名 helper；事件、自然帧和取消入口维持相同语义。继续拒绝所有浏览器回调中出现编译 helper，不向页面注入替代全局函数。

## 验证

先执行 `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-browser-serialization.test.ts --update=none`，扫描回归和新增真实加载回归均失败，共 2 失败、3 通过。

修复后以 `CI=1` 执行序列化及两组生命周期合同，共 3 文件、33 项通过；真实 tsx 初始化回调在无 helper 的隔离 realm 中能够递归调度、记录自然帧与原生事件。ESLint 和定向严格 TypeScript 检查通过。独立工作树借用依赖时禁用自动依赖修复设置。

## 适用边界

此验证证明 CLI 转译后的闭包可在独立 JavaScript realm 执行，不代表浏览器原生过渡或像素已验收。未启动浏览器或设备；仍需统一预检后的真实执行。本次只改变观察脚本，不改变生成 CSS，static CSS 基线不变；运行报告 fixture hash 包含脚本，会随改动重新绑定。

## 规则评估

不新增 AGENTS 规则。扩展已有序列化门槛和真实加载回归，覆盖本次此前遗漏的递归采样路径。
