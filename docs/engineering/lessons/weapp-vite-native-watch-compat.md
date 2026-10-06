---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1257
baseline: 9eaa7a864030b731649c2cd6bd1355824d3300ee
regressions:
  - scripts/ci/demo-matrix/weapp-vite-engine-compat.test.mjs
---

# weapp-vite 原生监听与宿主模块格式边界

## 症状

PR #1257 的 macOS Node 24 job `110315805179` 首次 replace 缺少当前 render marker；PR #1258 的 job `110347159455` 在 replace 成功后，add 缺少标记。两者都等待原有 180 秒上限，安装和生产构建已通过。历史连续更新诊断也记录了源码已保存但没有 source-change 的情况；不能以某一次本地通过覆盖这些失败。

## 根因与纠正

[Rolldown #10992](https://github.com/rolldown/rolldown/pull/10992) 修正了重复注册已监听路径时仍打开空原生批次的问题。macOS FSEvents 在空批次中也会停止并重启，窗口中的保存可能丢失。修复从 Rolldown 1.2.12 发布；本次将原先解析为 1.2.10 的引擎精确覆盖到 1.2.12，保留其他工具链版本和原有 Rollup 补丁。

升级还需要处理独立的格式约束：[Rolldown #11038](https://github.com/rolldown/rolldown/pull/11038) 明确要求 DevEngine 的 devMode 使用 ESM。weapp-vite 7.3.0 的状态保持 HMR 原先请求 CJS，并自己补初始模块图。因此只升级原生包会直接报 INVALID_OPTION。

`patches/weapp-vite@7.3.0.patch` 将框架 DevEngine 输出改为 ESM，使用原生 renderer 生成模块图，再以最后的 `renderChunk` 插件把 ESM 转成小程序宿主 CJS。转换复用框架已有 Babel 依赖，保留静态导入、导出绑定、动态导入与 registerGraph 调用。CJS 补图 hook 的原条件保持，它不再介入 ESM renderer，避免重复补图。输出仍属于同一个 bundler 产物图；不直接改写 dist、不额外扫描源码，也不强制重建、切换 HMR 模式、重复保存或等待固定时间。

该转换仅用于状态保持 dev 适配器，生产构建保持原路径。分包和 chunk 归属仍由原生构建图与框架决定，补丁不重新推导目录或修改 AI/IDE 流程。这里没有新增 Rust/native 加速或性能收益结论。

## 验证

- `CI=1 pnpm install --frozen-lockfile --offline`：精确锁文件安装通过；清除了 patch 安装自动带入的无关小版本更新。
- `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/weapp-vite-engine-compat.test.mjs scripts/ci/demo-matrix/version-contract.test.mjs --update=none`：20 项通过。包含同一引擎实例、上游 CJS 拒绝未绕过、宿主 require/live exports/模块图调用、POSIX/Windows/相对 chunk 名称，以及真实拆包构建的动态导入执行。
- `CI=1 pnpm e2e:demo:matrix weapp-vite-tailwindcss-v4:weapp --update --build-only`：重生成对应 static 基线，无差异。
- 原 demo 矩阵 production/initial/replace/add/restore 通过。随后固定依赖，在同一个服务进程扩展为六组 replace/add/restore，18 次保存全部验证当前标记；保持原断言及 180 秒上限。串行验证，没有作为性能采样。
- 后续复查原始 session.log 发现上述真实 demo 已由框架自动降级到 classic：1.2.12 runtime 未满足框架的 `common runtime helpers` 契约。因此这些更新结果仅证明 classic 链路；此前若将它们解读为状态保持 HMR 的完整验收，该解读不成立。ESM/CJS 转换测试只覆盖转换边界，状态保持运行时及设备行为仍未验证。保留原日志，不把自动降级记作状态保持通过。
- `CI=1 pnpm --filter weapp-tailwindcss... run build`、新测试显式 ESLint、`pnpm agents:check`、`pnpm architecture:check`、`git diff --check` 通过；真实 restore 快照的 18 个 JS 产物全部可按宿主脚本解析。
- 原始失败日志、首次候选日志、固定依赖日志和六组结果保留在任务 artifacts。最新 head 的远端 CI 仍须单独核对。

## 适用边界

此次发布包补丁限定 weapp-vite 7.3.0 与 Rolldown 1.2.12。它修正已识别的监听窗口并接入受支持的模块格式；有限验证不能证明消除了所有可能的监听竞态。上游框架发布包含相同 ESM/CJS 边界处理的版本后，应验证以上回归和真实 demo，再删除此补丁与覆盖项，不自动套用到其他版本。

后续 7.4.0 升级遗漏了补丁迁移。当前版本的修复、精确依赖图和验证见[补丁升级复盘](./weapp-vite-patch-upgrade.md)；本页保留 7.3.0 的历史证据及曾自动降级的限制。

两份 PR 的历史性能失败、样本不完整和设备未验证范围不变。没有进行本轮全端预检或 IDE/真机全面验收；hosted CI 成功也不等于全端和全部性能验收。没有发布、关闭 Issue 或绕过审查规则。

## 规则评估

不新增 AGENTS 规则；现有关于 bundler 产物图、精确依赖补丁、真实链路回归和证据保留的规则足以覆盖本次修复。
