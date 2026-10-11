---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: e07eaae86d9f3ffc2bd9c7bc52cf5398f12dc296
regressions:
  - e2e/wechat-app-id.test.ts
  - e2e/issue-1214-layout-static.test.ts
  - e2e/issue-1214-ide.test.ts
  - e2e/issue-1241-ide.test.ts
---

# 微信临时项目的授权配置

## 症状

全面验收的质量、static 与 52 项多平台构建断言通过后，#1214 微信 IDE 启动返回 HTTP 500。DevTools 2.02.2609231 日志明确记录 `formatProject reject tourist/empty appid`，页面断言尚未执行。

## 根因与纠正

预检生成授权 AppID 项目，但尺寸用例复用静态 fixture 的 `touristappid`。两条链路配置不一致，导致预检就绪并不能保证该临时项目可启动。

将授权 AppID 解析集中到 `scripts/wechat-app-id.ts`，由预检及 #1214/#1241 IDE fixture 共用。保留 `E2E_PREFLIGHT_WECHAT_APPID` 显式配置，并在启动前拒绝空值、游客和格式无效的配置。AppID 从源码 manifest 进入 uni-app 构建图，不在构建后改写输出。

## 验证

- 新增真实构建断言在修复前以 `touristappid` 失败，修复后通过。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/wechat-app-id.test.ts e2e/preflight-probes.test.ts e2e/issue-1214-layout-static.test.ts --update=none`：25 项通过。
- `pnpm e2e:ide:issue-1214`（指定本轮官方 CLI）：真实 DevTools 尺寸对照通过，包含截图与运行时尺寸。
- `E2E_IDE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1241-ide.test.ts --update=none`（指定本轮官方 CLI）：双入口四组 spacing 尺寸对照通过。
- #1214 static 基线在不更新模式下通过；仅授权配置变化，WXSS/WXML 基线无差异。
- 本轮证据保存在 `e2e/.artifacts/preflight/d1bd5e66-ecec-424d-8733-635bb13a211e/`，失败与定向修复日志均保留。全面验收需要修复后的新预检，不能据此声明后续多端阶段通过。

## 适用边界

AppID 格式校验不证明账户权限；真实授权仍由微信预检确认。静态构建 fixture 可使用游客配置，实际 IDE 自动化项目必须显式注入授权配置。

## 规则评估

不新增 AGENTS 条目；现有输入、构建产物和运行时逐层验收规则足够。通过共用配置解析与真实编译回归防止同类漂移。
