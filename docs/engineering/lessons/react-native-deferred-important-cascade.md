---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1311
baseline: 0a0ec49f74dbfeb2fc0761bbbbe8ebebd0eec868
regressions:
  - packages/react-native/test/deferred-important-cascade.test.ts
---

# React Native 延迟重要属性的级联失效

## 症状

PR 合并审查发现：同为 `!important` 的后声明相对行高或 currentColor 阴影覆盖固定值时，单独查询样式正确，但与内联样式组合会带回已被覆盖的值。

最小输入分别为：

```css
.earlier { line-height: 20px !important; }
.later { line-height: 1.5 !important; }
```

```css
.earlier { box-shadow: 0 1px red !important; }
.later { box-shadow: 0 2px currentColor !important; }
```

对两者分别调用 `tw('later earlier')`，缺少继承字号或颜色时返回 `{}`；继续调用 `composeStyle(style, { opacity: 0.5 })`，旧实现分别追加 `{ lineHeight: 20 }` 和旧红色阴影。提供内联 `fontSize: 24` 或 `color: 'blue'` 时，才会生成新声明对应的行高 36 或蓝色阴影。类名顺序不改变 CSS 源顺序。

## 根因与纠正

运行时同时维护普通样式、重要样式以及延迟计算的元数据。新的延迟声明赢得级联时，普通样式中的旧属性会被清除，重要样式却仍保留旧属性。缺少上下文时，新值暂时不能计算，组合阶段因此重放旧的重要属性。

在负责规则级联的 `resolveRules` 中同步清除被覆盖的普通和重要属性，再由最终上下文计算回填。仅清除获胜延迟声明对应的属性，不丢弃其它重要属性，也不在组合阶段改变优先级。阴影失效提前到声明获胜时，覆盖同一规则内重复声明的场景。

持久回归见[延迟重要属性级联测试](../../../packages/react-native/test/deferred-important-cascade.test.ts)。测试覆盖动态查询、静态 lookup、对象与编号 StyleSheet、同规则重复声明、内联与环境上下文，以及重要固定值和普通延迟值之间的优先级。

## 验证

本地环境为 macOS arm64、Node 24.18.0、pnpm 12.14.0、Vitest 5.0.4；修复后记录对应基线加本轮未提交改动。

- `CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/deferred-important-cascade.test.ts --update=none`：新增测试在修复前为 12 失败、12 通过，修复后 24 项全部通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run --update=none`：20 个文件、136 项测试通过。
- `pnpm --filter @weapp-tailwindcss/react-native typecheck` 与 `pnpm --filter @weapp-tailwindcss/react-native build`：严格类型及 ESM/CJS 构建通过。
- `pnpm exec eslint --no-ignore packages/react-native/src/runtime/resolve.ts packages/react-native/test/deferred-important-cascade.test.ts`：源码与新增测试检查通过。
- `pnpm release status`：现有中文 intent 覆盖 React Native 的 patch，未执行版本变更或发布。

## 适用边界

已复现和修复的是编译器到 JavaScript 运行时的样式组合，不据此声明 Android/iOS 的实际渲染已验证。本轮只运行定向包验证，没有启动设备或执行本地全面测试；既有微信服务与 Android UI 结构预检阻塞继续保留。PR 当前 head 的 CI 必须在推送后重新核对，旧 head 的成功不能代表本轮修复。

未调整 demo、CSS 输出或设备夹具，无需更新 static 基线。全能力目录、原生语义夹具与 served bundle 等既有覆盖缺口仍为 partial。

## 规则评估

不新增 AGENTS 规则。通过精确的级联失效边界和持续回归维护语义，继续遵守原有预检、支持预期及证据门禁。
