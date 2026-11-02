---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1325
baseline: 80efee1e22769557c4c73308c546f446c929320a
regressions:
  - e2e/fixtures/issue-1325-style-boundary.repro.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vite-native-style-requests.test.ts
verification:
  - claim: main 的 script 字符串和注释仍污染真实 style 请求，伪 scoped 载体及过期事务失败也未处理
    kind: unit
    status: failed
    sha: 80efee1e22769557c4c73308c546f446c929320a
    environment: macOS，Node 24.22.1，pnpm 12.15.0；生产源码未修改，追加独立失败复现与故障快照
    command: pnpm exec vitest run --config e2e/fixtures/issue-1325-style-boundary.vitest.ts --update=none
    reason: 5 项中 4 项语义断言失败，1 项故障现场快照匹配；快照匹配不表示修复
  - claim: main 运行时闭包在原工程 Vapor iOS 首次编译失败
    kind: native
    status: failed
    sha: 80efee1e22769557c4c73308c546f446c929320a
    environment: HBuilderX 5.34.2026102909，Vapor bytecode，iPhone 18 Pro / iOS 27.2；原工程 b239192f，B 组完整 main tarball 闭包
    command: pnpm exec tsx .tmp/issue1319-1325/original-ios.ts b ready
    reason: mp-html.uvue 的 script 注释被提取为 CSS，Unknown word 10:3 与误提取内容一致
  - claim: Issue 1319 原组件的微信运行态边框验收
    kind: native
    status: pending
    sha: 80efee1e22769557c4c73308c546f446c929320a
    environment: HBuilderX 5.34，微信 Stable 2.02.2608080，原工程 A 组，原空 scoped style 和局部样式配置保留；只增加两个节点 id
    command: pnpm exec vitest run wechat.test.ts --config .tmp/issue1319-1325/wechat.config.ts --update=none
    reason: A 微信编译成功，但 IDE auto 返回 HTTP 500 / 业务码 10；登录检查通过，未取得原组件运行态
---

## 症状

本文件保留 `80efee1e` 的修复前失败记录。后续实现与验收进展见 [SFC 修复记录](issue-1319-1325-sfc-repair.md)，不能将旧基线的失败或通过替代修复版的结果。

本轮验收 [#1319](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1319) 与 [#1325](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1325)，不能认定二者均已根治。

| Issue | 本轮结论 | 直接证据与限制 |
| --- | --- | --- |
| #1319 | 验证受限 | 原首页组件完成 A 组微信编译，运行态被 IDE 项目打开错误阻断；没有取得目标 `[1,0,0,0]` 和外卡片 `[1,1,1,1]` 的实际值，Harmony 未验收 |
| #1325 | 同类来源/索引缺陷仍可复现 | main 组在原工程 Vapor iOS 编译失败，另有四项独立语义回归失败；原报告的具体故障页仍不确定，不能把此结果等同于完整复现全部间歇现象 |

原工程固定为 `cq112233/unibestX@b239192f46611f51877aef48ca851b4c67c47f44`。主仓从执行时最新 `origin/main` 创建独立 worktree，分支 `codex/verify-1319-1325-main`；main tree 为 `33bb0c1e5751f33eaca87afe6b7052ddcf58cede`。

## 根因与纠正

### 原工程中的确定失败

A 使用原锁 npm `weapp-tailwindcss@5.6.3`，完成 Vapor iOS 编译和同步，设备截图停在原工程隐私页。B 的核心版本号同为 5.6.3，但实际消费 main tarball，编译报错：

```text
[plugin:uts] uni_modules/mp-html/components/mp-html/mp-html.uvue:10:3: Unknown word
at uni_modules/mp-html/components/mp-html/mp-html.uvue:1310:3
已停止运行...
```

两组该 SFC 的 SHA256 完全相同：`63a61f219f601413ffe996e65938f4b8e3f97c6407abea422d887b0ac152650b`。第 528 行的 script 注释为：

```text
行内节点映射到静态 class（见文件末尾 <style> 里的说明）。
```

`extractSfcStyleBlocks` 全局匹配 `<style ...>…</style>`，把注释里的标签识别成起点，直到真实 style 的结束标签才停止；误提取内容长 26281 字符，其中第 10 行恰为：

```uts
  if (name == 'b' || name == 'strong') return 'mp-b'
```

main 新增的样式快照回放把该内容交给真实 style 请求，UTS 被当成 CSS 解析。这是确定的插件边界错误；无需修改厂商文件或用“多个 style 不支持”解释。

### 独立失败回归

持久复现入口：[issue-1325-style-boundary.repro.test.ts](../../../e2e/fixtures/issue-1325-style-boundary.repro.test.ts)。它保留四个正确预期，正常执行会以非零退出；未使用 skip 或预期失败标记，也未修改生产实现。

1. 脚本字符串包含普通 `<style>`：真实作者 index 1 取到字符串内的 `.example`，生成块归属随之偏移。
2. 脚本注释包含 `<style>`：真实作者请求取到含 UTS、`</script>` 和模板的伪 CSS，与原工程错误同源。
3. 脚本字符串包含 `<style scoped>`：`transform.ts` 的另一处全局扫描把伪块选为生成载体，与已经更新的 script 范围冲突，抛 `MagicStringError`。仅修快照提取器仍不够。
4. style 请求等待旧事务时，较新事务成功后旧事务 reject 仍击穿等待者；旧 transform 自身的失败应保留，最新样式请求应跟随当前成功事务。该项是独立生命周期缺口，尚未证明是原设备报告的触发条件。

普通字符串样例由 Vue 3.5.44、DCloud 非 Vapor compiler-sfc 3.4.21、DCloud Vapor compiler-sfc 3.6.0-rc.9 独立解析：均无错误。输入只有一个真实作者 style；转换后真实索引为 preflight、作者、生成块，script 保持原文。正确预期不使用生产提取器生成，避免测试重现同一误解析。

后续根本修复应统一 SFC 顶层块边界，同时覆盖 `transform.ts` 与 `sfc-style-source.ts`，跳过 script 原始文本和注释中的标签；不能对 mp-html 特判，也不能关闭 preflight 或局部样式规避。本轮任务验收 main，未把候选修复混入被测基线。

## 验证

### A/B 身份与工具链

两组各自独立 frozen install，主仓依赖亦独立安装，没有借用其他 worktree 的 node_modules。原工程使用 pnpm 10.6.1；主仓使用 pnpm 12.15.0；Node 为 24.22.1。

| 固定项 | A / B |
| --- | --- |
| DCloud 四个直接包 | 3.0.0-alpha-5030320261021002 |
| Tailwind | 4.3.3 |
| Vite | 5.2.8 |
| Vue | 3.5.44 |
| Rollup / TypeScript | 4.64.7 / 5.8.3 |
| 工程共享 PostCSS peer | 8.5.30 |

B 显式固定根 PostCSS 8.5.30，避免锁重算改变 DCloud peer 身份；main engine/postcss 内部仍按其 manifest 使用 8.5.32。其余闭包升级逐项核对 main 声明。21 个 tarball 的哈希、override、integrity 和安装锁一致；15 个实际安装包的 1347 文件逐项 SHA256 匹配；6 个 optional 按平台过滤；24 条运行时包依赖边均指向 B 闭包。Darwin native 包没有 `.node`，本轮默认 JS 后端证据不能称为 Node-API 二进制验收。

A 原锁 SHA256 未变：`ce6a1acb90ac379210eeef3fd53d7513804f54314a396bd1d4a17ea3ead77eb2`；B 锁为 `852d58dd78ab5061a7c926fbfd14b5ae61a3a439c89c5a74ecd813f7075ed7ad`。Vite CJS 入口分别为 `6e343d8f54dd3ab5514d36bfcd39ac3861630da54ced5b48ba1d0766f5db704f` 与 `be39f9f9eb7401d9c3bd0fd110aeaaaa1441c002b4775a8cd4276245b4dc4b87`。

HBuilderX stable 为 5.34.2026102909，Xcode 27.2，iOS 绑定 `F71D607A-41F5-4B9C-9420-48693E7D31D3` / iPhone 18 Pro / iOS 27.2。实际日志为 `编译器版本：5.34（uni-app x）蒸汽模式`、`当前视图层编译目标：字节码`、`UNI_UTS_PLATFORM: app-ios`、Tailwind 4.3.3。工程配置静态导入自己的 npm DCloud 插件；不能仅凭 IDE 版本将整个链路都记为 IDE 内置编译器。未取得全插件 hook 顺序与每个编译器入口的实际 require 追踪。

原工程的依赖同步脚本和全局终止进程脚本均未执行。构建自行生成的 manifest 与原文件差异已留存；A/B 配置源码固定，未通过更改原工程业务代码消除 B 的错误。微信探针仅给原组件增加目标/卡片 id，保留 HTML 转换、空 scoped style 和局部样式配置。

### 已运行的本地检查

- `pnpm build:pkgs`：36/36 成功，0 cache。
- `pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers/vite-template-assets.unit.test.ts test/bundlers/vite-css-transform-task.unit.test.ts test/ci/architecture-contract.test.ts --update=none`：26 文件、323 项通过；这组既有回归未覆盖本次四个缺口。
- `pnpm architecture:check`：37 包、1558 源文件检查通过。
- `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`：失败，保留五项既有诊断：`web-rpx-finalize-loader.ts` 的 TS2322、两项 TS4111、TS2345，以及 `generic-web-production-fast-path.ts` 的 TS2379；未声称类型通过。
- 新增失败入口定向 `-u` 生成一项故障 static 快照，审查后以 `--update=none` 再验：同样四项语义失败、一项现场快照匹配。该快照保存完整 SFC、转换后 SFC 和 style 请求/返回；它记录错误，不能替代正确性断言。

```sh
# 从仓库根执行；预期当前 main 返回非零，显示四个真实失败。
pnpm exec vitest run --config e2e/fixtures/issue-1325-style-boundary.vitest.ts --update=none
```

这是手动失败复现入口；普通包单测和普通 E2E 不自动收集 fixtures 中的该文件。修复时应把正确预期纳入常规回归，更新对应现场基线，不将四个断言改成预期失败。

### 设备门禁及中止范围

本轮完整预检 `4f1c6cde-01e1-4a22-a742-cdfe064f210d` 已 prepare、当前会话 computer use、verify、claim 通过。所有产品验收经同一 gate driver 串行执行。A 原工程微信编译成功，随后 IDE auto 返回 HTTP 500 / 业务码 10，login-before-auto 已通过；这是项目/服务操作失败，不能推断成账号认证失败。立即归还租约、标记该报告 blocked，停止后续设备调度。用户原 `issue-1252` 微信窗口保持，未登录、注销或清缓存。

A 的首次 iOS 观察曾因错误的 readiness 谓词，在基座安装后、工程同步前结束，截图为系统桌面；该次作为无效运行态证据保留。纠正谓词后的独立观察取得编译成功、同步成功和原工程隐私页截图。B 保留首次编译失败，未用重跑成功覆盖。期间一次临时 Vitest 配置的数组合并意外扩大测试选择，已按归属停止该进程，该次不计入验收结果。

隐私页的后续同意操作已获用户授权；由于 B 在进入设备前即编译失败，本轮没有据此宣称原首页实际验收完成。未写同意存储或修改闸门。

## 适用边界

本轮没有完成、也不宣称通过：#1319 的微信/Harmony Vapor 实际边框和三个冷启动、方向切换、组合/清零/删除恢复、作者覆盖；#1325 的原首页与独立矩阵十次冷启动、十轮连续更新、预处理器/外部 src；H5 与 VDOM 对照；纯 HMR 与原生重载的本轮 Launch 次数。B 原工程 iOS 编译失败及后续微信环境阻塞，使这些结果保持未验收，不能用先前 demo、H5 或 CI 代替。

本轮没有新增/修改 demo；原工程微信产物的 235 项 WXML/WXSS/JSON 哈希清单已保存，运行态未取得。新增最小样式输出回归有持久 static 快照及不更新复验。既有 main 的来源快照、路径、乱序请求等测试通过，只证明相应覆盖范围。

原始日志、输入、A 的转换后 SFC、原生产物、tarball/安装 receipt、失败截图与门禁在本任务忽略目录 `.tmp/issue1319-1325/` 和 `e2e/.artifacts/preflight/<run-id>/`。其中 `original-b-ios-ready/hbuilderx.log` 为首个原工程 main 失败，`persistent-repro-none.log` 为四项最小回归的实际结果，`installed-receipt.json` 为依赖身份审计，`wechat-a-first/compile.json` 与 `static-baseline.json` 为成功编译及产物身份。保留失败截图的旧 App 画面不构成 B 运行成功证据。

本记录关联 Refs #1319、Refs #1325；没有发布新包、提交 PR、合并、关闭 Issue 或更改公开 API。

## 规则评估

不新增 AGENTS 规则。现有规则已经要求以真实 SFC/构建图维护来源、固化失败回归、保留登录态并在环境故障时停止。这里需要纠正解析边界和测试覆盖，增加规则不能替代代码修复。
