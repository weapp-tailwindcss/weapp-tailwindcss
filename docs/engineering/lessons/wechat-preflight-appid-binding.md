---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ce4a58bad6bf286891a2fed7db21e8950dd97ece
regressions:
  - e2e/wechat-app-id.test.ts
  - e2e/preflight-wechat-binding.test.ts
  - e2e/preflight-wechat-probe.test.ts
  - e2e/preflight-gate.test.ts
  - e2e/preflight-error-report.test.ts
  - e2e/preflight-probes.test.ts
---

# 微信预检与模板项目的 AppID 绑定

## 症状

扩展验收前 26 个阶段通过后，模板微信 IDE 阶段启动 MPX 项目返回 HTTP 500。2026-10-04 10:05:14 的 DevTools 日志明确记录 `formatProject reject tourist/empty appid`，目标为 `templates/mpx-tailwindcss-v4/dist/wx`，AppID 为 `touristappid`。同期只读登录检查仍通过，因此首次失败发生在项目身份校验，不能归因为登录失效。

首次失败与拒绝记录保存在 `e2e/.artifacts/full-regression/b3d5c1c5-c330-4823-ab64-82c731c0c5c5/template-ide-primary-error.txt` 和同目录 `wechat-template-rejection.json`，未包含用户票据。

## 根因与纠正

预检使用 `E2E_PREFLIGHT_WECHAT_APPID`，模板入口独立读取 `E2E_TEMPLATE_IDE_APP_ID` 并默认游客项目。预检报告只绑定工具实例，没有记录实际验证的 AppID，两个入口可以在同一轮验收中选择不同身份。

授权配置统一由 `resolveWechatAppId` 解析：无配置沿用仓库默认值，任一个别名单独配置均生效，两个别名相同可用，冲突或无效值在访问 IDE 前拒绝。预检将真实探针项目的 AppID 保存到 `wechat.appid`；verify/live 阶段及门禁要求该绑定存在且与当前配置一致。门禁把绑定同步传给两个别名；模板会话在构建完成后临时覆盖供 IDE 使用的 `project.config.json`，结束后恢复原字节，配置生命周期由模板会话负责。

模板别名加入预检配置身份，领取之后改变配置也会在下一阶段前阻断。领取成功后若绑定验证失败，门禁必须归还租约；归还也失败时保留原始绑定错误与清理错误，不留下静默占用。合成 fixture 显式隔离两个外部 AppID 别名，防止真实全面验收注入的身份污染模拟测试。

## 验证

- 首批回归在修改生产实现前失败，确认单别名选择、绑定传递和缺证阻断的缺口；修复后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/wechat-app-id.test.ts e2e/preflight-wechat-binding.test.ts e2e/preflight-wechat-probe.test.ts e2e/preflight-gate.test.ts e2e/preflight-probes.test.ts e2e/preflight-error-report.test.ts --update=none`：6 个文件、77 项通过。
- 探针回归使用合成页面与图片，核对项目 manifest、返回绑定及 live 复查分别使用默认值、预检别名或模板别名；没有调用真实 IDE。
- 门禁回归使用真实本地预检会话服务及模拟探针，覆盖缺失绑定、失配绑定、领取后配置变化、零测试步骤启动和租约归还错误。
- 关联回归从外层注入 `E2E_PREFLIGHT_WECHAT_APPID=wx0123456789abcdef E2E_TEMPLATE_IDE_APP_ID=wx0123456789abcdef`，检查预检、微信服务与工作流 fixture 的环境隔离：19 个文件、219 项通过。另一个 CSS 断言文件因独立工作树缺少依赖产物首次收集失败，补齐 postcss-calc、escape、source-scan 与 engine 构建后单独运行 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-assertions.test.ts --update=none`：6 项通过；该文件并非环境门禁测试。
- `scripts/wechat-app-id.ts` 及其单测的严格类型检查、所有改动 TypeScript 文件的 ESLint、`pnpm agents:check` 和 `git diff --check` 通过。
- 本次仅修改验收身份与编排边界，不改变 demo 样式输出，不更新 static 基线。真实预检及全部模板 IDE 验收由整合提交后的主工作树完成，本记录不将模拟测试计为真实设备验收。

## 适用边界

格式正确的 AppID 不代表当前账户具备权限，真实探针仍须通过。旧报告缺少 AppID 绑定必须重新预检，不能使用默认值兼容放行。此修复不启动或重启 IDE，不登录、注销或修改票据。

## 规则评估

不新增 AGENTS 条目；多端手册补充别名一致性与报告绑定要求。以共用解析器、探针结果、门禁传递和持久回归约束数据流，避免分别维护默认值。
