---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41056106022
baseline: d2b9224c453575aa30cac147d652f2c1811a6265
regressions:
  - scripts/ci/demo-matrix/output.test.mjs
  - scripts/ci/demo-matrix/matrix.test.mjs
verification:
  - claim: Linux 和 Windows 的 Vite 7 生产资产相同，但与旧静态基线不符
    kind: ci
    status: failed
    sha: d2b9224c453575aa30cac147d652f2c1811a6265
    environment: GitHub Actions Linux / Windows / Node 24.22.2 / pnpm 12.15.0
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41056106022
  - claim: 精确同步单目标基线后，生产、开发、三轮更新与刷新全部通过
    kind: integration
    status: passed
    sha: e2982546c6bf648e855e413b38c506a4937d3e91
    environment: macOS / Node 24.22.1 / pnpm 12.15.0 / 含未提交的单目标基线同步
    command: pnpm e2e:demo:matrix web/vue-vite7-tailwindcss-v4:web
---

# Vite 7 Web 真实资产的静态基线同步

## 症状

PR Gate 的 Linux 和 Windows Node 24 job 均完成 Vite 7.3.7 生产构建，随后在 `run.mjs` 的静态深比较失败。开发服务、浏览器与 HMR 尚未启动。两平台的 CSS、JS、HTML 字节完全一致；CSS 的 SHA256 为 `f853bd081f3b4ec9bf9ec877157641d204d7bc2114d6daf7ea8747c4c4250efd`。

原基线只记录颜色字面值及 `.25rem`。真实资产还包含主题变量、透明色的 rgba 回退、条件 color-mix 和 `0.25rem`。原始产物与首败保留，不能将静态失败改判为运行时成功。

## 根因与纠正

Generic Web finalizer 已改为沿构建图保留真实框架资产；它的专用路径没有调用模块 CSS 注入流程，也不应拿模块生成记录覆盖最终资产。只读复核未发现这些新增值来自该 finalizer 的重放，因而没有依据删除真实资产中的规则以迎合旧基线。

本次只通过登记的单项目命令重新生成基线，完整保留所有新增值与原值。没有对值做等价归一化，没有删除条件规则，也没有改深比较或浏览器断言。其他项目的基线保持原样。

## 验证

先执行 `pnpm e2e:demo:matrix web/vue-vite7-tailwindcss-v4:web --build-only`，本地复现同一差异；再执行带 `--update --build-only` 的同一目标重新生成基线。`build-only` 只用于生产基线处理，不作为完整通过。

独立后台 Chromium 加载原生产页面，精确核对高度 32/80/200px、margin-top 8px、flex、任意高度 64/400px、slate 颜色 `rgb(98, 116, 142)` 和 emerald 透明色 `rgba(236, 253, 245, 0.8)`，共 9 项通过，无页面错误；浏览器与 HTTP 服务均关闭。首次审计脚本因 CommonJS 导出读取错误而未启动浏览器，失败记录保留，修正审计脚本后通过。

最终执行不带更新参数的完整单目标命令，生产、initial、replace、add、restore、refresh 全部通过；源码在 finally 恢复，基线哈希保持不变，任务开发端口已关闭。三次本地生产 CSS 与两平台首败 CSS 的 SHA256 一致。测试资源由本任务创建并关闭，没有操作用户 Chrome 或 IDE 会话。

## 适用边界

产物中仍有两套高度重叠的 Tailwind 样式主体，本次没有证明重复来源已解决。默认主题下的计算值一致，不表示动态主题覆盖下的变量与字面值普遍等价，也不将现代 Chromium 结果扩大为旧浏览器验收。

本次仅同步 Vite 7 Web 样例的精确输出合同。远端修复提交仍待验证；uni 性能门禁、本地全面多端验收及 PR 的正常审核要求继续独立保留。

## 规则评估

沿用已有的定向基线生成、差异审查及禁止更新复验规则，不新增规则。
