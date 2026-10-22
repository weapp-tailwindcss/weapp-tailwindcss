---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 9e34203becf535b374817d620ae7d62f99609e50
regressions:
  - packages/weapp-tailwindcss/test/ci/native-runtime-boundary.test.ts
  - packages/react-native/test/metro-publication.test.ts
  - packages/react-native/test/runtime-publication.test.ts
  - e2e/react-native-metro-worker.test.ts
  - e2e/react-native-encoding-evidence.test.ts
  - e2e/react-native-phase-evidence.test.ts
  - e2e/react-native-phase-capture.test.ts
---

# React Native manifest 的发布与安装身份

## 症状

Metro 刷新先修改内存 manifest，再依次写虚拟 JS、JSON 和 ready。任一写入失败后，内存仍指向未发布的新轮次。撤销 ready 在本轮 Promise 之外，失败时读取者可沿用旧成功。worker 只检查 ready 前后一致，没有核对它对应的 JSON 字节。

运行时在调用 StyleSheet 注册器之前切换 manifest 并清除缓存。注册器抛错后，manifest、样式和 important 元数据来自不同轮次。独立实例还会覆盖顶层 getter 使用的全局 manifest；调用方也能通过输入或 getter 的可变引用改写已安装样式。

## 根因与纠正

发布者对 manifest 只序列化一次，计算实际 UTF-8 字节摘要，生成不可变快照。虚拟模块、JSON、ready 共享该快照，ready 最后发布，全部成功才提交内存 snapshot。pending 和错误标记均属于本轮 ready；错误标记也写失败时保留原错误 cause。bootstrap 只写入口独有的虚拟占位文件，成功后才登记，不提前触碰项目已有的正式发布。

异步查询在同一次 ready 核对中返回完整 snapshot；transformer 不再分开读取 manifest 与身份。公开入口为只读实时视图。worker 先处理稳定的错误标记，再读取 JSON 并核对摘要，拒绝无身份的历史数字 ready。文件路径与项目根目录查询选择最近注册的入口，显式 ID 继续指向其注册项。

运行时先准备独立 manifest 副本、身份与宿主样式，再切换状态。manifest 和身份均冻结，宿主获得可规范化的自有 styles 副本。注册器重入替换时，旧结果保留实际注册器版本，后续查询重新注册。顶层 getter 委托默认实例；匿名安装清除旧身份，无 manifest 不得安装身份。

E2E 独立核对 ready 中的摘要与归档 JSON，核对虚拟模块安装的 revision、摘要及原始 JSON。反例同时重算外层归档摘要，避免只靠损坏文件的 hash 不符提前拒绝；语义和路径反例保留合法身份，继续命中原有 oracle。

4ea 的 hosted 单测随后发现纯快照工具放在 `src/manifest.ts`，被原生运行时引入后越过 `src/runtime/**` 的所有权边界。完整迁入 `src/runtime/manifest.ts`，Metro 与运行时共同消费它；不扩大闭包白名单，不改变原子发布或冻结语义。

## 验证

本片基于上述 baseline 的未提交改动，Node 24.18.0、pnpm 12.14.0、macOS arm64。首先固化 11 项发布与运行时失败回归，全部失败后修复。随后补 bootstrap、发布身份和宿主副本等反例；不存在 manifest 却安装身份、冻结宿主入参、factory 重入三项均真实复现。

- `CI=1 pnpm --filter @weapp-tailwindcss/react-native test --update=none`：22 文件、158 项通过；覆盖文件失败、错误标记失败、不可变安装和独立实例。
- `CI=1 pnpm --filter @weapp-tailwindcss/react-native typecheck`：通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-encoding-evidence.test.ts e2e/react-native-phase-evidence.test.ts e2e/react-native-phase-capture.test.ts e2e/react-native-metro-worker.test.ts e2e/react-native-declarations.test.ts e2e/react-native-compatibility.test.ts --update=none`：6 文件、91 项通过，含两种配置保留方式下的真实独立 Node worker、ESM/CJS 根入口与 runtime 的同一实例消费、独立 Node 类型消费，以及 Web/Android/iOS 的实际 Metro export 和后台 Web smoke。原生 export 不算原生实际渲染。
- Node 类型消费曾因推断返回类型经根 barrel 引入 Babel 与原生类型而失败；registry 改为直接依赖中性类型并声明返回边界后通过。首次并行调度两个会重建相同 dist 的验证也造成 transformer 文件暂时缺失，保留失败日志；最终 6 文件由同一 Vitest 串行执行，没有并行改写产物。
- `CI=1 pnpm e2e:react-native:static:update`：重新生成 Expo static 基线，仅 `report.verifiedAt` 更新，CSS、manifest、候选及语义预期均未变化；随后以上 `--update=none` 回归通过。26 个运行时案例仍需新鲜端侧证据。
- 定向 ESLint、`pnpm agents:check` 与 `pnpm release status` 通过；新增中文 patch intent，未发布。
- 4ea 的 CI job `119203280753` 及本地 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/native-runtime-boundary.test.ts --update=none` 均先复现一项闭包失败。迁移后同一八项闭包回归全部通过，Node、CSS 编译器和生成器的负向检查保持有效；RN 包二十二文件一百五十八项再次通过。日志保留在 `.tmp/rn-manifest-boundary-*`，源码目录迁移不改变 demo 样式输出或 static 基线。

## 适用边界

原生运行时只校验身份格式并透传，没有重新计算摘要。归档仍标记 `servedBundle: not-captured`；这些结果不能证明 HTTP/WS 实际交付、设备加载及 HMR 回执已闭环。相同项目根目录同时长期运行多个独立 Metro 服务的隔离也未由本片建立；当前共享的项目发布文件不能视为每个注册 ID 各自独立的跨 worker 存储。

同步 `getVirtualModuleCode` 读取诊断快照，不构成当前发布成功证据。完整原生与新增身份链的实际设备运行仍待新一轮环境预检后执行。

## 规则评估

不新增 AGENTS 规则。现有根因复现、不可变边界与证据分层要求已经覆盖，使用持久回归约束发布及安装生命周期。
