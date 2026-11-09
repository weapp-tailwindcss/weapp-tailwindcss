---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1340
baseline: 0e99c0f1d96bb7848ff8c76e749fe80c02597f35
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-stage.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vite-native-style-requests.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vapor-style-demo.test.ts
  - packages/weapp-tailwindcss/test/context/generation-snapshot-reuse.test.ts
verification:
  - claim: 生成快照保护覆盖与池淘汰不同的短暂无结果情形
    kind: unit
    status: passed
    sha: e8ec9f7f6de25e503e234d6e188744629044bcdf
    environment: macOS，Node 24，pnpm 12，当前工作树
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-css-stage.test.ts --update=none
  - claim: 生成管线、uni-app x/Vapor 定向回归和架构契约通过
    kind: integration
    status: passed
    sha: e8ec9f7f6de25e503e234d6e188744629044bcdf
    environment: macOS，当前工作树
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-css-stage.test.ts test/bundlers/vite-uni-app-x-css-watch.integration.test.ts test/uni-app-x/vite-native-style-requests.test.ts test/uni-app-x/vapor-style-demo.test.ts test/context/generation-snapshot-reuse.test.ts test/ci/architecture-contract.test.ts --update=none
  - claim: HBuilderX 与 Android 设备预检可用，但完整多端门禁未放行
    kind: native
    status: blocked
    sha: e8ec9f7f6de25e503e234d6e188744629044bcdf
    environment: HBuilderX 5.34.2026102909，Android L204203G00581 / Android 7.1.2；预检 run f1d5ccdd-05e1-4121-9fad-1dbc5295dc64
    command: pnpm e2e:preflight prepare
  - claim: iOS Vapor 目标生成订单相关原生样式并可启动真实页面
    kind: native
    status: passed
    sha: ca0d1e1652aec72f26c29007a3569b0fbc4e2feb
    environment: HBuilderX 5.34.2026102909，iPhone 17 Pro 模拟器
    command: HBuilderX CLI launch app-ios --compile false --iosTarget simulator --deviceId <本轮预检绑定的 iOS 模拟器>
  - claim: Harmony Vapor 目标生成订单相关原生样式，但 HAP 签名阻塞安装
    kind: native
    status: blocked
    sha: ca0d1e1652aec72f26c29007a3569b0fbc4e2feb
    environment: HBuilderX 5.34.2026102909，Harmony 设备在线
    command: HBuilderX CLI launch app-harmony --compile false --deviceId <本轮预检绑定的 Harmony 设备>
  - claim: 129 个并发 scope 不会因缓存容量淘汰而丢弃生成结果
    kind: unit
    status: passed
    sha: 待提交
    environment: macOS，Node 24，pnpm 12
    command: pnpm --filter weapp-tailwindcss exec vitest run test/compiler/compilation-session-pool.test.ts --update=none
  - claim: 用户提供的 151 页 Android Vapor 复现从 54 个缺失降至 0
    kind: native
    status: passed
    sha: 待提交
    environment: HBuilderX 5.34.2026102909，Android L204203G00581 / Android 7.1.2，weapp-tailwindcss 5.7.2，Tailwind CSS 4.3.3
    command: HBuilderX CLI launch app-android --compile true --deviceId <本轮预检绑定的 Android 设备> --vaporRenderTarget bytecode；pnpm check
  - claim: 修复后的编译会话池保护全部在途 scope
    kind: unit
    status: passed
    sha: 待提交
    environment: macOS，Node 24，pnpm 12
    command: pnpm --filter weapp-tailwindcss exec vitest run test/compiler/compilation-session-pool.test.ts --update=none
  - claim: 生成失效和 Android Vapor 构建适配回归通过
    kind: integration
    status: passed
    sha: 待提交
    environment: macOS，Node 24，pnpm 12，Tailwind CSS 4.3.5
    command: pnpm --filter weapp-tailwindcss exec vitest run test/compiler/tailwind-generation-invalidation.integration.test.ts test/compiler/tailwind-generation-invalidation.test.ts test/bundlers/vite-web-css-stage.test.ts test/bundlers/vite-uni-app-x-css-watch.integration.test.ts test/uni-app-x/vite-native-style-requests.test.ts test/uni-app-x/vapor-style-demo.test.ts test/context/generation-snapshot-reuse.test.ts test/ci/architecture-contract.test.ts --update=none
  - claim: weapp-tailwindcss 类型检查与包构建通过
    kind: build
    status: passed
    sha: 待提交
    environment: macOS，Node 24，pnpm 12
    command: pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit；pnpm --filter weapp-tailwindcss build
---

# Android Vapor 原生 CSS 快照保留

## 症状

uni-app x Android Vapor 的多个独立 `<style>` 请求并发生成时，部分 Tailwind 工具类偶发消失。列表页可能丢失 `flex-1`，详情页可能丢失图片尺寸和 `flex-row`；H5 浏览器链路正常。

## 根因与修复

`CompilationSessionPool` 将 scope 缓存上限设为 128。第 129 个不同 scope 注册时，旧逻辑直接淘汰最早条目并设为 inactive，即使该 scope 的 CSS 生成仍在执行。生成任务结束后，`runEntry()` 因 `entry.active === false` 拒绝提交；调用链得到未提交结果，SFC 的 `@apply` 后续被 PostCSS 消去，Android Vapor 最终字节码只剩空选择器。页面和组件较少时通常不触发，scope 数量高且生成重叠时才会间歇出现。

现在池只在超限时淘汰没有进行中 execution 的最旧 LRU scope；如果所有 scope 都在生成，则暂时允许池超过 128，任务结算后再回收空闲条目。显式失效和 pool dispose 仍按原生命周期取消旧 scope 的提交资格。已有带编译指纹的 CSS 快照保护继续覆盖独立的短暂无结果场景，但不再作为本次缺陷根因的解释。

## 验证

本地单元、uni-app x/Vapor 定向回归、架构契约、类型检查和核心包构建均通过。快照保护是独立防线；本次根因回归覆盖超过缓存上限时仍在执行的 scope。

根因回归先以 129 个同步挂起的不同 scope 稳定失败（原池容量 128，首个结果 `committed: false`），再验证修复后所有 129 个任务都提交成功；任务结束后缓存重新收敛到不超过 128。用户提供的 151 页最小压力复现工程在隔离副本中验证：原版 5.7.2 的 HBuilderX 5.34 Android Vapor 冷编译检查 302 个模板，54 个样式包完全缺少 `wtu-*`；接入修复 tarball 并清理 `unpackage` 后再次冷编译，缺失数为 0。原复现目录未修改。

随后在用户提供的 Chaser 项目隔离副本中，先按 `package.json` 安装 5.7.2（原 lockfile 仍锁定 5.6.3），用原版 5.7.2 完成 Android Vapor 字节码冷编译：431 个 `.style.bytes` 中有 139 个为 143 B 空包；订单详情的 `OrderReceiverBlock`、`OrderPendingPayView`、`OrderAmountPanel`、`OrderPayBar` 分别为 143 B、143 B、143 B、143 B。替换为本分支 5.7.2 tarball 并清理 `unpackage` 后，修复冷编译降至 10 个 143 B 空包，上述订单详情文件增至 1859 B、3135 B、1924 B、2315 B；订单列表模块为 725 B、订单卡片为 3562 B。第二轮修复冷编译和一轮增量编译也成功，记录的订单相关样式包大小及总包数一致；未保留可核对的跨轮 SHA-256，因此不声称哈希一致。剩余 10 个空包未作为订单样式缺陷或本次修复回归宣称；其组件候选情况未逐项审计。Chaser 原始目录未修改。

Android 冷编译产物已确认包含订单列表模块、订单卡片、待付款商品和收货区的有效样式。iOS 与 Harmony 对应中间产物的记录大小分别为 726/3562/3137/1868 B，Harmony 中间产物与 iOS 记录一致。样式字节码通过 `strings` 可见 `wtu-*` 工具类标识和 `--tw-*` 展开变量；未发现裸 `@apply`。

iOS 编译后使用调试基座真实启动，截图保存在用户案例隔离副本的 `evidence/ios-running.png`，显示首页已渲染，首次运行停在定位权限弹窗，因此未把订单页截图冒充为业务页面验收。Harmony 编译已生成 52 个 `.style.bytes` 文件并进入 Hvigor 打包，但在 `SignHap` 阶段因配置引用的签名证书文件不存在而失败；没有修改签名配置，也没有把在线设备误报为运行通过。

本轮预检报告 `e2e/.artifacts/preflight/678c317c-7895-4d05-87d7-e80f929cfd42/report.md` 仍未放行全面多端门禁：微信 IDE 连接和 Android UI 探针失败。该阻塞与插件层回归、Android/iOS 构建产物证据、Harmony 签名阻塞分别记录，不能用旧报告替代。

## 适用边界

最小压力复现工程和 Chaser 的 5.7.2 原版/修复版 Android 产物提供了插件池淘汰与样式丢失之间的直接对照；Chaser 修复后两轮冷编译及一次增量编译的订单相关样式包一致。此前 iOS Vapor 已编译并在模拟器调试基座启动首页。Harmony 生成了样式字节码，但 HAP 缺失签名证书，未安装运行。全面多端预检仍被微信 IDE 连接和 Android UI 探针阻断，不能描述为全端门禁通过。

## 规则评估

不新增 AGENTS 规则。回归覆盖在途 scope 的淘汰保护、显式失效与执行完成后的 LRU 收敛。
