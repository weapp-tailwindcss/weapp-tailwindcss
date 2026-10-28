# Workspace Guidelines (`demo/*`)

## 适用范围
- 本文件适用于 `demo/*` 下所有演示与集成样例。
- `demo/*` 重点在“覆盖框架差异 + 回归验证”，不是公共 API 定义层。

## 通用原则
- 修改 demo 时优先维持演示可用性，不引入与示例目标无关的重构。
- 尽量保留各框架默认目录结构与构建脚本，避免因统一风格破坏框架约定。
- 若为回归问题新增 demo 变更，应在说明中标注对应问题场景与验证步骤。
- Tailwind CSS v4 demo 的样式必须由 `weapp-tailwindcss` 生成；不要注册 `@tailwindcss/postcss` 或 `@tailwindcss/vite` 来生成样式。
- Taro、uni-app 等 Web/H5 demo 遇到样式或 HMR 问题时，也应修正 `weapp-tailwindcss` 的生成链路，不能用官方 Tailwind 生成插件兜底。
- 涉及小程序样式输出、热更新或构建器适配问题时，demo/e2e 回归不能只覆盖微信小程序；Taro 与 uni-app 至少要包含一个非微信小程序目标，验证 `.acss`、`.ttss`、`.qss`、`.jxss` 或框架产出的 `.css` 等真实产物后缀。
- demo 不应通过 `app.wxss`、`main.wxss`、`app-origin.wxss` 这类固定文件名来证明通用行为；回归断言应面向框架真实输出文件集合和平台产物目录。

## 依赖升级

- 全面升级必须逐项检查全部 demo（含 Web、issue 复现与 style-injector）；通过依赖声明与构建配置识别 uni-app/DCloud 工具链，不能只按目录名筛选。通用命令排除的 uni-app 项目仍须专项处理，项目中的组件库、图标、Sass 等非编译器依赖也必须纳入检查。
- uni-app CLI 使用官方 UVM 配套清单，保留 workspace/catalog 管理；HBuilderX、uni-app-x 核对实际使用的 IDE、内置编译器和运行基座。正式版策略、命令与完成条件统一遵循[全面依赖升级](../docs/engineering/agent-workflow.md#全面依赖升级)。
- demo 工具链或依赖变化后，必须重新生成对应项目的 e2e static 快照/产物基线，审查差异，再以禁止更新模式复验；无产物差异也要记录项目、命令与结果，不制造快照改动。涉及 HMR、IDE 或原生基座时补对应真实链路验收。

## 构建与调试
- 按 demo 自身脚本执行（例如 `taro build --type weapp`、`uni -p mp-weixin`、`weapp-vite build`、`gulp`）。
- 对小程序 demo，涉及 `open`/上传脚本时注意路径与工具版本差异，不强制在 CI 场景执行。

## 测试与维护
- demo 的价值在于稳定复现；改动后至少保证一个关键路径可运行（`dev` 或 `build`）。
- 若调整了 demo 的依赖/脚本，建议同步更新对应 README 或注释，避免后续失效。
