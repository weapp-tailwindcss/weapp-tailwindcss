---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: b5aec68e5569a8030fc990fa48c3e59ef4a7e328
regressions:
  - e2e/react-native-declarations.test.ts
  - packages/react-native/test/babel.test.ts
  - packages/react-native/test/runtime.test.ts
  - packages/react-native/test/metro.test.ts
---

# React Native 类型来源与消费端契约

## 症状

Metro 修复后的扩大 TypeScript 检查发现 Babel AST 类型不兼容、样式缓存与实际返回值不符。包构建能生成声明，但此前没有执行严格全源码类型检查，因此构建成功不能证明类型契约正确。

## 根因与纠正

包使用 Babel 8 的 core/types，却从根目录的 Babel 7 traverse 类型取得 NodePath。改为从 `@babel/core` 导出取得同一依赖树的 NodePath，并通过真实 JSX 类型谓词收窄 style 属性。

运行时支持 StyleSheet 工厂返回的 ID 和数组，但缓存声明只允许普通对象，公开 tw 又用断言伪装成对象。样式类型统一采用现有 React Native peer 的 StyleProp，仅导入类型；工厂、缓存和返回值保持一致。composeStyle 通过 const 泛型保留内联类型和元组位置，普通数字不能冒充已注册 StyleSheet ID。

编译器清单与运行时类型拆开，避免 tsdown 将原生类型打进共享声明后污染 Node-only 子入口。真实构建后的声明复制到没有 React Native 的临时项目，用 TypeScript 检查 compiler、tailwind、metro。根入口仍导出运行时类型，因此需要原生 peer 类型；这是公开类型约束的收紧，中文 intent 使用 minor，README 给出 Node-only 迁移入口。

Metro 按同步配置与异步配置工厂分别声明返回值，保留自定义字段；扫描根与模块名明确处理缺失值，Node URL 不再混用 RN 全局类型。Tailwind 入口在调用父模块前去掉未提供的 cssEntries，保持 exactOptionalPropertyTypes 严格检查。

新增 `pnpm --filter @weapp-tailwindcss/react-native typecheck`，纳入源码和[真实消费端类型用例](../../../packages/react-native/test/types/consumer.ts)，覆盖 View/Text/Image、StyleSheet.create、静态/动态/组合样式及 Metro，接入根 typecheck 和 RN CI。RN CI 同时执行包内回归，独立 worker 和失败证据测试纳入既有兼容入口。

## 验证

- 新增类型消费用例后，旧实现的严格检查失败；覆盖 Babel 7/8、原生 style 赋值及 Metro 返回值。
- 修复后严格源码与消费端 typecheck 通过；包内 50 项回归通过。
- 原生示例 build 同时执行包构建和示例 tsc，验证真实公共声明消费。
- 不安装 React Native 的独立临时项目使用实际构建声明通过严格 TypeScript 检查，确认三个 Node 子入口无需原生 peer。
- `CI=1 pnpm typecheck` 与 `CI=1 pnpm --filter @weapp-tailwindcss/example-react-native-expo build` 通过。
- 兼容入口所列 8 个 E2E 文件以 `CI=1`、`--update=none` 运行，40 项通过，包含 Web/Android/iOS 真实 Metro export、后台 Web 渲染、独立 worker、发布声明、设备启动恢复协议和失败证据。
- ESLint、agents、架构、双语 README 和 release status 检查通过；RN intent 计划版本由 0.2.23 升为 0.3.0，未执行发布。

## 适用边界

类型检查不会证明所有原生样式已绘制，也不能代替模拟器截图与 CSS HMR。StyleProp 返回值不保证是普通对象；读取具体属性需要 StyleSheet.flatten。未新增运行时依赖或改变样式优先级。

## 规则评估

不新增 AGENTS 规则。修复既有类型来源和持续验证入口，比增加文字规则更直接。
