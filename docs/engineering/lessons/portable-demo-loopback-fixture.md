---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1288
baseline: 031fcd9f6f14210e2c9d192ddac7b85d4f6eeebe
regressions:
  - scripts/ci/demo-matrix/endpoint.test.mjs
  - scripts/ci/demo-matrix/webpack-hmr.test.mjs
---

# 端口避让回归的监听地址与服务归属

## 症状

[Demo Watch Diagnostic run 38290587895](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38290587895)、attempt 1、准确 head `031fcd9f6f14210e2c9d192ddac7b85d4f6eeebe` 的 [Windows / Node 24 job 114949443858](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38290587895/job/114949443858) 在脚本测试失败，尚未进入三轮真实 demo 验收。外链样式回归已通过，唯一失败是 `endpoint.test.mjs` 的真实端口避让用例：

```text
expected owned-development-server
received <script src="/main.js"></script>
at endpoint.test.mjs:71
```

返回内容精确匹配同时运行的 `webpack-hmr.test.mjs` HTTP 夹具。两项测试约在同一毫秒结束，构建器自身未报错；这是错误服务被消费的证据，不是 Tailwind 或 Taro 输出缺陷。旧失败日志未打印公告 URL 和完整 session，不能进一步证明当时的地址族、数字端口或内核 socket 路由。

## 根因与纠正

占用器和 Vite4 夹具绑定 `0.0.0.0`，而并发 Webpack 夹具绑定 `127.0.0.1`。Vite4 将 wildcard 展示主机映射为 `localhost`。wildcard、特定接口和 DNS 地址族不是同一个唯一服务身份；以不同绑定地址来测试数字端口占用会把接口共享和 DNS 选择引入本应验证端点公告的测试。

占用器和 Vite 目标统一使用明确的 `127.0.0.1`。断言公告主机仍为该地址、目标确实避开已占用端口、原端口返回占用器内容、新端口返回本任务的唯一页面，并保留 hash 路由断言。失败时附公告 URL 和 session 日志，避免再次只有页面片段而缺少端点证据。独立清理本轮子进程、占用器与临时目录，一项失败不阻止其他资源回收。

`announcedViteUrl()` 继续保留构建器公告的主机，没有把所有 localhost/IPv6 公告强制改为 IPv4；三种主机解析测试和不可信地址、跨 origin 路由检查保持不变。产品监听与端点选择未改动。

## 验证

本地 macOS / Node 24.18.0 / pnpm 12.9.1，包含基线上本轮未提交夹具修正：

```sh
CI=1 corepack pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/endpoint.test.mjs scripts/ci/demo-matrix/webpack-hmr.test.mjs --update=none
```

两份测试并发运行，12 项通过，没有跳过。此结果证明明确 loopback 上的真实占用回退、公告、请求归属与并发 Webpack HMR；旧夹具的 Windows 现场失败不能由 macOS 通过替代，需新提交的准确 Windows job 验收。

## 适用边界

该变更是测试隔离与失败证据修正，不声称修复所有 wildcard 或双栈服务行为。新 head 的完整 CI 尚需单独核对。未执行本地全仓、IDE 或设备验收；记录保持 `partial`。

## 规则评估

不新增 AGENTS 规则。保留现有服务身份验收规则，直接固定夹具监听地址、断言与诊断信息。仅改私有测试，不新增包发布 intent、demo 内容或 static 基线。
