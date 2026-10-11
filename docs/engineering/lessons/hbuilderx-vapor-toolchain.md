---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ca7ea050536c60f35f2be27593052c6f8b021931
regressions:
  - e2e/uni-app-x-toolchain.test.ts
---

# HBuilderX Vapor 编译插件必须来自同一工具链

## 症状

HBuilderX 5.31.2026093020-alpha 在 Harmony 模拟器安装 Vapor demo 后，首次 App Launch 即报 `Cannot read property _vnode of undefined`。调用栈经过 `mountVNodePage`，没有进入页面的 DOM 探针。原始证据为 `e2e/.artifacts/uni-app-x-alpha/harmony-vapor-diagnostic-8e097fef4/uni-app-x-vapor-tailwindcss-v4-harmony-vapor/hbuilderx.log`。

## 根因与纠正

页面编译产物使用 `defineComponent`，同时包含 Vapor 字节码的 `__dynamicSharedData` 和 `useSharedDataPage`，却没有 `__vapor`。运行时依据 `pageComponent.__vapor` 分流，错误进入 VDOM 挂载，再访问不存在的 `pageContainer._vnode`。该异常发生在页面 setup 之前，不能通过修改 DOM 探针解决。

三个 uni-app x demo 的配置静态导入项目依赖 `@dcloudio/vite-plugin-uni@3.0.0-alpha-5020220260725001`。其 `dist/vue/options.js` 尚无 `uniAppXVaporSfcTransform`，而当前 HBuilderX 自带 `3.0.0-alpha-5020720260921001` 的 App DOM2 编译已取消源码标签上的 vapor 注入，改由该 descriptor 回调设置标志。旧配置工厂和新平台编译器组合后丢失了这个步骤。

使用真实 Node `createRequire(configUrl).resolve(...)`，已确认原始静态导入解析到项目 pnpm 中的七月版本；新入口解析到当前 Alpha 应用的编译器包。npm 模式仍解析到同一项目依赖。该验证只读取模块身份，没有启动 IDE 或构建，也不能替代设备复验。

共享[选择器](../../../demo/uni-app-x-plugin.ts)在加载 uni 插件前确定工具链：IDE 环境优先使用 `HX_PLUGIN_PATHS` 中的 `uniapp-cli-vite`，然后使用 `UNI_HBUILDERX_PLUGINS` 或自动化环境的 `HX_APP_ROOT`；普通 npm CLI 从调用配置自身解析依赖。IDE 插件不存在或身份不完整时立即失败，不能回退到项目版本。日志输出 `[uni-toolchain]` 和实际入口，供下一轮原生验证核对。

路径协议依据已安装 vendor 的 `uni-cli-shared/dist/hbx/pluginPaths.js`：`HX_PLUGIN_PATHS` 是 JSON 对象映射，并非平台分隔的列表；映射存在时，缺少对应键也不回退。`UNI_HBUILDERX_PLUGINS` 由 `uniapp-extension` 的 `getEnv()` 从当前 APPROOT 设置。保留 Windows 盘符、根目录、UNC 和相对路径回归，不写入本机安装位置。

## 验证

- 离线回归覆盖两套实际临时 package 的模块求值、CJS/default 导出、IDE 插件缺失、非法身份、路径与三个配置的静态导入边界。
- 修复前，三个配置的静态导入边界失败；接入选择器后通过。测试以 `--update=none` 运行。
- 已验证选择器与回归文件的独立 TypeScript 检查、定向 ESLint。公开包未变化，无需 change intent。
- 当前独立工作树只复用既有工具依赖执行离线检查；没有运行原生设备测试或更新 demo static 基线。原生首屏、构建产物及对应 static 更新由主工作树串行执行后补充记录。

主工作树集成提交 `2225ce0f1` 后，22 项定向回归通过，并完成以下真实验证：

- 在 OpenHarmony 6.1.1.125 模拟器上，以原有 App runner 的初始产物、运行模式、DOM 和截图断言执行一次明确不含 HMR 步骤的定向诊断，24.015 秒通过。日志实际选择 Alpha 安装中的插件；生成页改为 `defineVaporSharedDataComponent`，缺失的 shared-data 字节码恢复，页面不再报 `_vnode` 错误。
- DOM 中本轮 marker 为 `173 × 41`，Tailwind 与原生对照文字的宽高均为 `220 × 52`；首屏截图可见实际内容。原始日志、结构、截图及三个编译产物和 SHA-256 保存在 `e2e/.artifacts/uni-app-x-alpha/vapor-toolchain-2225ce0f1/`。此结果不代表纯 HMR 已通过。
- 对 VDOM 小程序与 issue-1144 Web 限定执行 `e2e/uni-app-x-vdom-tailwindcss-v4.test.ts`、`e2e/issue-1144-static.test.ts` 的 `-u` 重建，3 项通过，所有已跟踪基线字节不变；随后 `--update=none` 重新构建，3 项通过、无跳过，24.70 秒。Vapor 未登记普通 static 快照入口，已重新生成并保存本轮原生 JS、shared-data 与样式字节码，并通过既有产物断言，不将其描述为普通 static 快照验收。

定向单测入口：`pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-toolchain.test.ts --update=none`。

## 适用边界

本修复涉及 `uni-app-x-vapor-tailwindcss-v4`、`uni-app-x-vdom-tailwindcss-v4` 与 `issue-1144-uni-app-x-web` 的构建配置，不给页面追加 vapor 标记，不改样式生成语义。下一轮 Vapor 验证必须核对 `[uni-toolchain]`、生成页的 `defineVaporSharedDataComponent`、真实首屏 marker/结构/截图，再继续验收。上述 `2225ce0f1` 轮次已通过首屏验证；新提交仍需独立验收，首屏成功不代表 HMR 通过。

另一个 VDOM Harmony 失败独立存在：同轮 20:45:30 的 IDE 内部日志报告 `10310009 ArkTS: INTERNAL ERROR`，`ColdReloadArkTS` 无法从上下文找到项目别名路径的 `EntryAbility.ets`，与真实路径身份混用有关。其后重建才出现输出符号表路径错误，不能把后续错误当作首次失败原因。参见[既有纯 HMR 边界](uni-app-x-alpha-hmr.md)。

当前 launcher 的 `quickFix` 在补丁编译成功后调用 `aa force-stop` 和 `bm quickfix`，再重启应用；`liteMode` 对应 CLI 的 `compile`，会停止运行流程，不是保持运行状态的热更新开关。因此本修复不声称解决 Harmony 纯 HMR，也不通过修改验收门槛放行。

## 规则评估

不新增 AGENTS 规则。以共享选择器和可执行回归固定依赖入口，避免复制平台版本判断或用页面属性隐藏工具链混用。
