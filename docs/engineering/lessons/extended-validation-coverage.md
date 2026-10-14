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
  - e2e/preflight-pnpm.test.ts
  - e2e/packed-pnpm-identity.test.ts
  - packages/weapp-tailwindcss/test/native-targets.test.ts
  - packages/weapp-tailwindcss/test/wxml/Tokenizer.test.ts
  - website/scripts/local-worker/server.test.ts
  - website/scripts/local-worker/command.test.ts
  - website/scripts/local-worker/process-lifecycle.test.ts
  - website/scripts/local-worker/windows-lifecycle.test.ts
---

# 扩展验收的遗漏阶段必须进入同一次门禁

## 症状

全面验收入口已有构建、质量、模板、多端与原生运行时阶段，但遗漏本机 Rust ABI、CSS 兼容内核的独立类型/打包/浏览器对照，以及网站受众、严格 SEO、Worker 与三浏览器本地产物验证。仅执行原有扩展入口不能证明这些阶段通过。

## 根因与纠正

独立包新增验证脚本后，聚合入口没有同步消费。新增阶段统一纳入扩展步骤，原生 ABI 在发布产物检查之前执行；所有步骤使用一次领取的预检会话，失败立即停止后续调度，不通过嵌套全面入口重复领取报告。

原生目标根据当前 Node 宿主的平台、架构及 libc 选择。Linux 缺少 glibc 信息不能直接推定 musl；共享库明确登记 `ld-musl-*` 或 `libc.musl-*` 才是 musl 证据。预检分别在两个 Rust 内核目录确认 compiler、Cargo、Clippy 与标准库，保留 rustup 代理入口名，避免以解析后的 rustup 路径调用导致 argv0 改变。遵循 `RUSTC` 优先于 `CARGO_BUILD_RUSTC` 的环境覆盖关系。

扩展 Web 探针在后台逐个完成 Chromium、Firefox、WebKit 的交互与截图，同时验证网站自定义 Chromium channel。工具链和浏览器配置绑定到预检身份，变化后旧报告失效。交互失败与关闭失败同时保留，关闭失败不能覆盖首次错误。

网站本地入口需要绑定本轮构建身份与独立 Wrangler 子进程，显式传入测试 URL，禁止更新截图；提前退出、取消、请求或响应体挂起和清理失败均属于阻断边界。具体操作维护在[多端手册](../../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。

进程退出和后代结束属于不同的边界。Playwright 在 POSIX 上启动的浏览器使用独立进程组，根 CLI 退出后仅停止原进程组会遗漏这类后代；Windows 的历史根 PID 也不能用于重新领取树归属。网站作用域应在根仍存活时捕获身份并持续观察，收尾核验已登记后代的出生身份，不按进程名称或旧 PPID 扩大清理范围。初始身份不足、查询超时和晚到结果必须阻断，取消与 observer 关闭失败均需保留。

入口 pnpm 身份也必须穿过临时消费者边界。隔离目录没有仓库的 `packageManager`，通过 PATH 再调用裸 `pnpm` 会选择另一版本。CSS 与 native 打包验证统一消费共享执行边界，按子进程有效环境保留活动 CLI，沿用跨平台入口解析与参数传递；显式清除活动入口或关闭环境继承时不能误继承父调用者。

## 验证

在 macOS arm64、Node 24.18.0、pnpm 12.9.1 的本任务工作树中，修复前的宿主目标 12 项回归全部失败，扩展编排 2 项失败，证明新合同原先没有实现。修复后主包目标映射 13 项通过，编排与预检相关 8 文件共 144 项通过，使用 `CI=1` 和 `--update=none`。其中环境、浏览器和设备探针采用合成替身，只证明门禁合同，不证明真实设备或浏览器验收。

定向命令：

```bash
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-extended.test.ts e2e/demo-workflow-quality.test.ts e2e/preflight-rust.test.ts e2e/preflight-browser.test.ts e2e/preflight-runtime-scope.test.ts e2e/preflight-gate.test.ts e2e/preflight-evidence.test.ts e2e/preflight-probes.test.ts --update=none
pnpm --filter weapp-tailwindcss exec vitest run test/native-targets.test.ts --update=none --coverage.enabled=false
```

网站生命周期修复在合入主任务工作树后，部署与生命周期 6 文件共 55 项回归通过，其中新增生命周期 4 文件共 37 项；扩展编排与共享进程树/observer 6 文件共 66 项通过。定向 TypeScript 与 ESLint 通过。真实合成 Node 进程证明同组及独立组后代收尾行为；Windows 分支仍是受控身份替身，不能作为 Windows 原机验收。两次首次失败原始输出保存在 `e2e/.artifacts/full-validation-20261014/website-lifecycle-first-failure.log` 与 `website-detached-first-failure.log`。

```bash
pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/docs-deployment.test.ts scripts/deploy-docs-cloudflare.test.mjs scripts/local-worker/server.test.ts scripts/local-worker/command.test.ts scripts/local-worker/process-lifecycle.test.ts scripts/local-worker/windows-lifecycle.test.ts --update=none
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-extended.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-exit-lifecycle.test.ts e2e/demo-workflow-windows-cleanup.test.ts e2e/demo-workflow-capture-flight.test.ts e2e/demo-workflow-process-observer.test.ts --update=none
```

尚未构建运行时包时，网站完整类型检查因 `cva`、`merge`、`variants` 声明缺失而失败，需在门禁内构建后复验，不能将定向检查替代完整网站类型验收。

当前修复保存在独立工作树的本地提交，尚未推送 main。实际执行 `pnpm e2e:preflight prepare --extended`，基础工具、微信 IDE 真实连接、HBuilderX、iOS、Android、Harmony、三浏览器交互与 RN/Lynx 两端工具链共 9 项脚本探针通过；原生 UI 工具此前返回 `The Mac is locked and automatic unlock could not unlock it`，当前会话 computer use 无法完成。本轮使用 `e2e:preflight block` 保存原始错误并关闭服务，报告保留在 `e2e/.artifacts/preflight/c8f94e0a-963a-46a7-a15b-7a3e17ee7ed9/report.json`。用户解锁后必须重新 prepare，不能复用已阻断报告。完整扩展验收和真实网站 Worker 尚未启动，changeset 收尾和 main 推送尚未执行。

用户解锁后，`7a2d4265-464f-45af-87f9-92e99c3d526e` 的原生 Chrome 六类动作证据与 verify 已全部通过。审查同时发现隔离 cwd 的裸 pnpm 实际选择全局 `12.11.2`，入口却是 `12.9.1`；为修复源码而结束该服务并保留通过时的原始报告，未领取全面门禁。首次合成 CLI 的 pack/install 两项失败保存于 `e2e/.artifacts/full-validation-20261014/packed-pnpm-first-failure.log`；修复后共享执行边界在真实临时目录保持 `12.9.1`。源码改变后必须新 prepare，不能用这份已结束报告启动全面入口。

随后在 `18040b279079613cf96097a037b184c245415fbd` 上，新报告 `ce6d5ba6-b50b-4220-9668-3e1c1e474535` 的脚本探针、原生 Chrome 六类动作和 verify 全部通过。完整扩展流程前 12 阶段通过，包括根构建的 71 个任务、9577 项单测、基础质量检查、网站构建和完整类型检查；单测另有 1 项预期失败与 44 项条件跳过，不计入已执行通过。该提交已直接推送 main。

第 13 阶段真实执行 Rust 1.99 的 `cargo clippy --all-targets -- -D warnings` 时，`wxml/transform.rs` 的 `chunks_exact(3)` 触发 `chunks_exact_to_as_chunks`，流程停止后续 44 个阶段，预检服务正常关闭。原始输出与阶段报告保留在 `e2e/.artifacts/full-validation-20261014/full-run-ce6d-observed.log` 和 `round-ce6d/`。修复使用稳定的 `as_chunks::<3>()` 表达静态 token 的三元组边界，不关闭 lint，也不提升当前 Rust 1.96 的最低要求。[新增 Rust 回归](../../../packages/weapp-tailwindcss/native/src/wxml/transform/tests.rs)核对多个静态候选的顺序与间隔，以及后续相邻动态表达式必须在任何候选回调前整体回退；不改变预期样式输出，因此无需更新 static 基线。

在该 SHA 基础的未提交修复上，定向执行 `pnpm native:ci --target=aarch64-apple-darwin` 全部通过：两个内核的 44/17 项 Rust 单测与严格 Clippy、release 构建、真实 JS/WXML/CSS ABI 差分、隔离打包消费者，以及 13 个 Vitest 文件的 265 项断言。原始输出保留在 `e2e/.artifacts/full-validation-20261014/native-ci-after-clippy-fix.log`；这些结果仅证明本机 ABI，完整扩展流程仍需重新预检和重跑。

独立复核又发现两处入口身份边界：完整 Chromium 与默认无头 Chromium 可能来自不同安装，CSS 和网站的默认测试实际消费后者；预检不能只用 `executablePath()` 覆盖默认无头入口。pnpm 的版本核验与后续执行也必须消费同一活动入口，不能只检查 PATH 命令。扩展 Web 探针因此新增默认无头 launch；基础版本核验复用共享 pnpm 选择器，门禁身份记录其完整 invocation。修复前合成回归有 11 项失败，修复后 7 文件 114 项通过，首次错误摘录与命令保留在 `preflight-shell-first-failure.log`、`preflight-shell-final-validation.log`。这仍是门禁合同回归，真实环境必须由新一轮 prepare 验证。

## 适用边界

本轮宿主为 macOS arm64。Windows/Linux 原机、其他原生架构和历史特殊版本对照未执行，合成目标映射不能替代这些环境。全面验收未完成前保持 `partial`，不以门禁单测通过宣称全仓通过。

共享 POSIX 身份源沿用基线的 `ps lstart` 秒级出生时间；纯函数检查只能确认相同 PID、相同秒级时间的替代行无法区分，未诱发真实系统 PID 复用。本轮没有修复这一既有精度边界，也没有证明两次采集之间丢失全部活身份锚的孤儿归属；不得把本轮生命周期回归写成完整进程身份保证。

## 规则评估

沿用现有一次性门禁、失败阻断、后台浏览器及进程归属规则，补持久回归与唯一操作手册；不新增根规则，不改变微信 IDE 登录态保护。
