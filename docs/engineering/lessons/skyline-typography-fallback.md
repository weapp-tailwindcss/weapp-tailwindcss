---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 35762afa58b7bdd665324e46e23011106d2727fb
regressions:
  - e2e/skyline-typography-ide.test.ts
  - e2e/skyline-typography-static.test.ts
---

# Skyline 字体变量 fallback 与自引用 reset 的复现

## 症状

来源为本次用户提供的 uni-app / Skyline 问题，没有对应的 GitHub Issue。
在微信开发者工具 `2.02.2608080`、基础库 `3.10.3`、iPhone 12/13 (Pro) 模拟器中：

```css
.sample {
  font-size: 20px;
  line-height: var(--tw-leading, var(--text-header-md--line-height));
}
.initial { --tw-leading: initial; }
```

主题行高为 `32px`，同一段两行文字在 WebView 高 `64px`，Skyline 高 `56px`。
将 fallback 直接写成 `32px` 仍可复现，不能把问题仅归因为嵌套 `var()`。
uni-app v4 demo 使用共享组件的两个页面，页面 JSON 分别声明 `skyline` / `webview`。
测试核验实际 `getCurrentPages()` 的 renderer、route 及本轮构建的唯一 dataset marker。

## 根因与纠正

已定位首次差异在 Skyline 对自定义属性 `initial` 的运行时处理，尚未定位微信内部实现。
不能删除 `--tw-leading` / `--tw-font-weight` 消费端，否则会损坏工具类和动态变量覆盖。
作者空值是合法的空内容，与 guaranteed-invalid reset 不同，不应全局替换。
当前插件补齐的空默认值也会使字体 fallback 不生效，需要与引擎的 `initial` 问题区分。

首个候选为自引用：

```css
.cycle {
  --tw-leading: var(--tw-leading);
  --tw-font-weight: var(--tw-font-weight);
}
```

局部 `.cycle` 在两个 renderer 中均恢复 `64px`，内联设置 `44px` 后为 `88px`，清除后恢复 `64px`。
但把完全相同的两个 reset 加到全局初始化范围会触发更严重的问题：

```css
view,text {
  --tw-leading: var(--tw-leading);
  --tw-font-weight: var(--tw-font-weight);
}
```

独立原生项目只增加上述规则后，WebView 仍能完成 `64 → 88 → 64px`；
切换 Skyline 后白屏，`App.callFunction` 无响应，开发者工具显示：

> 模拟器长时间没有响应，请确认你的业务逻辑中是否有复杂运算，或者死循环

原生 computer use 同时核验了 `当前渲染模式: Skyline` 与 `skyline_renderer` 的页面路径。
自动化因 marker 等待超时而没有得到该轮 Skyline 的运行时 identity JSON，不能伪造计算样式或身份返回。
这些证据证明了白屏和协议无响应，尚不能证明微信内部崩溃或死循环的具体实现根因。

**因此停止全局自引用转换方案，撤回候选实现和 `cssOptions.skyline` 配置，不发布该选项。**
仅局部类规则通过，不能作为全局 preflight 转换安全的依据；定向单测通过也不能替代真实渲染验证。

## 验证

原生观测值（两行、字号 `20px`、主题行高 `32px`）：

| 输入 | WebView | Skyline |
| --- | --- | --- |
| 缺失变量，嵌套 fallback | 64px | 64px |
| `initial`，嵌套 fallback | 64px | 56px |
| `initial`，字面量 fallback | 64px | 56px |
| 作者空值 | 56px | 56px |
| 有效 `44px` setter | 88px | 88px |
| 局部自引用，嵌套 / 字面量 fallback | 64px | 64px |
| 直接主题变量 | 64px | 64px |
| 全局自引用 | 可渲染、可覆盖和恢复 | 白屏、协议超时 |

Skyline 的 SelectorQuery 未返回 `line-height` / `font-weight` 计算字段；该端结论主要使用文字矩形尺寸与原生基准。
WebView 同时记录了计算样式。独立字重探针使用 Arial 与原生 400 / 700 对照，未把中文字体外观当作字重计算证明。

可审阅的观测字段保存在 [evidence.json](./assets/skyline-typography/evidence.json)，其中移除了本机绝对路径与系统权限字段。
局部规则截图：[Skyline](./assets/skyline-typography/scoped-skyline.png)、[WebView](./assets/skyline-typography/scoped-webview.png)。
完整日志、输入项目和截图保持原始形式留在忽略目录；全局失败没有可用的自动化截图，使用原生 UI 核对了白屏和无响应提示。

持续保留的入口：

```sh
# uni-app 对照页：只复现已观察到的引擎差异，不宣称已经修复
CI=1 E2E_IDE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/skyline-typography-ide.test.ts --update=none --coverage.enabled=false

# 原生局部 reset 矩阵，记录 default / override / restored
pnpm exec tsx e2e/skyline-typography-native.ts

# 独立手动诊断入口：已知可能使本次 Skyline 模拟器无响应，不纳入默认自动化
SKYLINE_GLOBAL_RESET=1 pnpm exec tsx e2e/skyline-typography-native.ts
```

脚本只连接已开启且已登录的 IDE；每次生成独立项目并通过原绑定服务关闭本次项目。
原始日志与截图保留在忽略的 `e2e/.artifacts/skyline-typography*`，原生脚本同时保存完整输入和 CSS SHA-256。
首次局部成功记录为 `0326a0b9-33d6-4eac-8530-38d143b9517d`；
首次全局失败记录为 `a3b82e7d-d258-4576-8424-f02de2f6c1a9`，两轮均已完成项目清理。
首次 uni-app 修复前 Skyline 回归为 `ef6897f7-e538-4241-8cab-ece2c767ede0`，测得 `56px`，原生对照 `64px`。

最终 uni-app 复现回归 `4d6ad2c5-9880-4cc7-8dd0-a855643682be` 通过，两端均核验了本轮唯一构建标识并完成清理。
持久原生脚本的局部矩阵复验 `3c2e2eff-5a85-42cd-802f-382b851dd61d` 完成两端 default / override / restored 观测并清理。
Skyline 作者空值清除覆盖后仍保留 `88px` 的异常也被记录，未用转换作者空值来掩盖它。

最终本地检查：

- 两个 static 入口共 3 项通过，限定 `uni-app-vite-tailwindcss-v4` 更新 18 个基线后，以 `--update=none` 再次通过。
- `e2e/wechat-session-boundary.test.ts` 的 5 项会话边界回归通过。
- `UNI_BUILD_STRICT=1 pnpm --filter @weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4 build:h5` 与 `build:mp-alipay` 均通过，检查真实 `.css` / `.acss` 产物保留嵌套变量链。
- 候选实现曾通过定向单测和包构建，但随后真实运行失败，已全部撤回；最终 PR 没有包源码差异，不能将候选单测作为修复通过证据。

## 适用边界

本次只验证上述 DevTools 模拟器与基础库组合。未验证物理设备、其他基础库或其他平台运行时。
H5、支付宝仅做构建产物验证，不推定其运行时语义。没有开展全仓全面验收，也不等待远端 CI。
动态覆盖、主题切换及工具类按钮保留用于人工继续排查；没有满足全局候选的通过门槛，不能将这些按钮的存在写成修复验收通过。
本次交付为复现草稿，不包含公开包行为变化，因此不新增发布 change intent。

## 规则评估

现有“先固化真实失败、再同用例复验”规则有效；需要核验初始化范围和组件边界，不能把局部 CSS 的成功外推到全局样式。
不新增全仓规则，不删除动态能力，不使用扩大选择器范围或硬编码产物路径来掩盖问题。
