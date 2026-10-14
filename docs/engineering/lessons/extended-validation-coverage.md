---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: b0a81994f4c55e419215ac1759a4b9ea0c481191
regressions:
  - e2e/demo-workflow-extended.test.ts
  - e2e/preflight-gate.test.ts
  - e2e/preflight-runtime-scope.test.ts
  - e2e/preflight-rust.test.ts
  - e2e/preflight-browser.test.ts
  - packages/weapp-tailwindcss/test/native-targets.test.ts
  - website/scripts/local-worker/server.test.ts
  - website/scripts/local-worker/command.test.ts
---

# 扩展验收的遗漏阶段必须进入同一次门禁

## 症状

全面验收入口已有构建、质量、模板、多端与原生运行时阶段，但遗漏本机 Rust ABI、CSS 兼容内核的独立类型/打包/浏览器对照，以及网站受众、严格 SEO、Worker 与三浏览器本地产物验证。仅执行原有扩展入口不能证明这些阶段通过。

## 根因与纠正

独立包新增验证脚本后，聚合入口没有同步消费。新增阶段统一纳入扩展步骤，原生 ABI 在发布产物检查之前执行；所有步骤使用一次领取的预检会话，失败立即停止后续调度，不通过嵌套全面入口重复领取报告。

原生目标根据当前 Node 宿主的平台、架构及 libc 选择。Linux 缺少 glibc 信息不能直接推定 musl；共享库明确登记 `ld-musl-*` 或 `libc.musl-*` 才是 musl 证据。预检分别在两个 Rust 内核目录确认 compiler、Cargo、Clippy 与标准库，保留 rustup 代理入口名，避免以解析后的 rustup 路径调用导致 argv0 改变。遵循 `RUSTC` 优先于 `CARGO_BUILD_RUSTC` 的环境覆盖关系。

扩展 Web 探针在后台逐个完成 Chromium、Firefox、WebKit 的交互与截图，同时验证网站自定义 Chromium channel。工具链和浏览器配置绑定到预检身份，变化后旧报告失效。交互失败与关闭失败同时保留，关闭失败不能覆盖首次错误。

网站本地入口需要绑定本轮构建身份与独立 Wrangler 子进程，显式传入测试 URL，禁止更新截图；提前退出、取消、请求或响应体挂起和清理失败均属于阻断边界。具体操作维护在[多端手册](../../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。

## 验证

在 macOS arm64、Node 24.18.0、pnpm 12.9.1 的本任务工作树中，修复前的宿主目标 12 项回归全部失败，扩展编排 2 项失败，证明新合同原先没有实现。修复后主包目标映射 13 项通过，编排与预检相关 8 文件共 144 项通过，使用 `CI=1` 和 `--update=none`。其中环境、浏览器和设备探针采用合成替身，只证明门禁合同，不证明真实设备或浏览器验收。

定向命令：

```bash
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-extended.test.ts e2e/demo-workflow-quality.test.ts e2e/preflight-rust.test.ts e2e/preflight-browser.test.ts e2e/preflight-runtime-scope.test.ts e2e/preflight-gate.test.ts e2e/preflight-evidence.test.ts e2e/preflight-probes.test.ts --update=none
pnpm --filter weapp-tailwindcss exec vitest run test/native-targets.test.ts --update=none --coverage.enabled=false
```

网站合成 HTTP/Node 生命周期定向回归 2 文件共 20 项通过，新入口定向 TypeScript 与 ESLint 通过；尚未构建运行时包时，网站完整类型检查因 `cva`、`merge`、`variants` 声明缺失而失败，需在门禁内构建后复验，不能将定向检查替代完整网站类型验收。

本条记录对应基线上的未提交改动和本任务网站提交。实际执行 `pnpm e2e:preflight prepare --extended`，基础工具、微信 IDE 真实连接、HBuilderX、iOS、Android、Harmony、三浏览器交互与 RN/Lynx 两端工具链共 9 项脚本探针通过；原生 UI 工具此前返回 `The Mac is locked and automatic unlock could not unlock it`，当前会话 computer use 无法完成。本轮使用 `e2e:preflight block` 保存原始错误并关闭服务，报告保留在 `e2e/.artifacts/preflight/c8f94e0a-963a-46a7-a15b-7a3e17ee7ed9/report.json`。用户解锁后必须重新 prepare，不能复用已阻断报告。完整扩展验收和真实网站 Worker 尚未启动，changeset 收尾和 main 推送尚未执行。

## 适用边界

本轮宿主为 macOS arm64。Windows/Linux 原机、其他原生架构和历史特殊版本对照未执行，合成目标映射不能替代这些环境。全面验收未完成前保持 `partial`，不以门禁单测通过宣称全仓通过。

## 规则评估

沿用现有一次性门禁、失败阻断、后台浏览器及进程归属规则，补持久回归与唯一操作手册；不新增根规则，不改变微信 IDE 登录态保护。
