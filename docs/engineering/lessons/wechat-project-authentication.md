---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1327
baseline: 3cf068ddcdb963772d3fc516355accaf9e074afe
regressions:
  - e2e/wechat-service-diagnostics.test.ts
  - e2e/wechat-session-boundary.test.ts
---

# 微信登录查询与项目接口认证

## 症状

2026-11-03，微信开发者工具 2.02.2609240 的界面显示已登录，官方 HTTP `/v2/isLogin` 返回 `login: true`，随后 `/v2/auto` 返回 HTTP 500、数字业务码 10。此前诊断只记录通用错误码，无法区分项目操作失败与项目接口认证错误；重复预检和重启未定位原因。

本轮使用一次隔离预检 worker，限量采集失败响应到权限为 0600 的任务临时文件。错误为官方包装的“需要重新登录”，栈经过 `fetchAttr → getAppIdAndAttr → getProjectInfo → /v2`。安装路径、HTTP 服务监听进程及配置目录与原生 computer use 看到的 IDE 一致，未发现连接到另一安装实例的证据。

## 根因与纠正

两项请求验证的范围不同。`/v2/isLogin` 不绑定项目，只返回 `ILoginService.isUserLogin()` 的布尔值；`auto` 在启动自动化之前还通过 `getProjectInfo` 查询项目属性。异常在 `await getAppIdAndAttr(...)` 处冒泡，尚未进入后面的 `attrErrcode` 包装分支。

官方实现把 `NOT_LOGIN`、`DEV_INVALID_SIGNATURE`、`DEV_NEED_RELOGIN` 三类远端错误统一映射为“需要重新登录”。因此该文本不能证明用户没有登录，也不能确定本次是哪一种远端错误。外层 HTTP 的 code 10 也不是原始 CGI 业务码。未读取账号、票据存储或票据日志；没有足够证据判定原始远端错误的原因。

仓库需要修复的是诊断信息丢失：仅当 HTTP 500、数字 code 10 和已核实的完整首行签名同时匹配时，输出固定的“项目接口返回需要重新登录类认证错误”，并明确它不代表 IDE 未登录。不搜索堆栈中的任意文字，不回显正文、时间或堆栈，不将其余 code 10 一概当成认证问题。

现有停止后续项目请求的边界保留。此改动不刷新凭据、不自动登录、不改动厂商文件，也不通过忽略远端认证错误让自动化继续运行。

## 验证

先补持久回归，原实现出现 4 项失败：3 项准确错误签名被归为通用错误，1 项登录查询通过后的项目认证异常没有准确提示。实现后定向回归通过。

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/wechat-service-diagnostics.test.ts e2e/wechat-service.test.ts e2e/wechat-service-close.test.ts e2e/wechat-session-boundary.test.ts e2e/preflight-wechat-service.test.ts e2e/preflight-error-report.test.ts --update=none
```

回归覆盖准确签名、LF/CRLF、相似前后缀、仅堆栈含有提示、字符串业务码、非字符串正文、敏感内容不回显，以及失败后不再发出 close/login 请求。真实单次 worker 仍在项目属性接口认证阶段失败；未将离线回归写成真实自动化恢复通过。

## 适用边界

已核实签名来自上述 IDE 版本；未识别的错误继续输出原安全分类。签名只是错误分类证据，不是登录状态、原始 CGI 码或远端根因的证明。

本轮结束时共享 IDE 已打开另一任务的工程，保持原状，未关闭或重启。只归档已退出、本任务 PID 与项目路径均匹配的残留租约。没有新建产品门禁或启动多端产品验收。脚本诊断已修复；真实自动化成功仍待项目接口恢复后重新验证。

## 规则评估

不新增 AGENTS 规则。多端手册补充两类状态的区别，继续遵守现有认证异常停止、用户会话保护和恢复后重新预检的边界。此变更仅涉及工程脚本与回归，不改变公开包行为，不触发包版本提升。
