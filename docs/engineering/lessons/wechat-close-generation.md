---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: a21520e808d118893e4d51ba19ab29da85b2b629
regressions:
  - e2e/wechat-service-close.test.ts
  - e2e/wechat-service.test.ts
  - e2e/wechat-automator.test.ts
  - e2e/ide-project-cleanup.test.ts
  - e2e/wechat-session-boundary.test.ts
---

# 微信项目关闭请求绑定原租约

## 症状

并发边界审查发现，同一项目的两个关闭请求可以同时通过所有权检查并进入服务队列。用本地 HTTP fixture 阻住第二个关闭回执，在第一个关闭完成后重新打开同路径项目，可确定性复现：新 auto 成功返回，但新连接无法借用，后续关闭也报租约不属于本轮。

## 根因与纠正

关闭请求只在入队前验证项目归属，没有登记正在关闭的状态。第二个旧 close 等待回执时，新 auto 已申请并登记新租约。旧回执处理重新读取当前项目，再用当前项目的 run ID 删除服务登记，误删了新租约。

服务层现在在入队前独占关闭责任，重复 close 直接拒绝，不发送第二次 HTTP 请求。出队时再次检查捕获的项目和服务租约；成功关闭后仅释放该对象对应的文件锁及内存登记。正在关闭的项目不能再借用连接。未知结果或失败仍保留锁，不自动重试、过期解锁或重启 IDE。

## 验证

修复前诊断明确记录 `/v2/auto → /v2/close → /v2/close → /v2/auto`，新租约已登记后出现借用和关闭失败。永久回归在修复前失败，修复后覆盖同路径重开和切换不同项目：重复关闭不增加 HTTP 请求，新连接仍可借用并正常关闭，文件锁最终释放。

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts \
  e2e/wechat-service-close.test.ts e2e/wechat-service.test.ts \
  e2e/wechat-automator.test.ts e2e/ide-project-cleanup.test.ts \
  e2e/wechat-session-boundary.test.ts --update=none
```

上述 5 文件、72 项通过。首次失败、确定性交错脚本及输出保存在完整轮次 `b3d6fee0-a937-483b-8144-629fd35d1b5d` 的本地归档中。

## 适用边界

这是本地 HTTP fixture 证实的独立清理缺陷，不能据此解释此前真实 IDE 的 30 秒 auto 或 App 就绪超时。现有正常调用层已经避免重复移交清理责任；这里补强底层边界。

本次不支持同一 IDE 服务的多项目并发，不修改登录、账号、缓存或超时预算。仅按路径发起的迟到调用仍不携带调用方的历史 run ID，不能把该接口当作可跨项目重开代际保存的关闭句柄。独立 IDE 服务的真实并发验收仍未完成。

修复前完整轮次在第 8 阶段因 npm registry TLS 握手失败停止，前 7 阶段通过；独立诊断又出现 `localhost` 证书不合规。此网络阻塞与本修复无关，未降低证书校验，历史完整轮次也不代表修复后提交验收。

## 规则评估

不新增 AGENTS。现有原服务归属、未知结果保留现场及禁止改变登录态的规则足够；以明确关闭状态、对象身份和持久回归补足实现。没有公开包或样式产物变化，不新增 change intent 或 static 基线。
