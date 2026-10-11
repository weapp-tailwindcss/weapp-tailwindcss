---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 5cb66dc55f6a12d171eb250bbcfea8390fd13857
regressions:
  - examples/react-lynx/src/components/CaseCard.test.ts
  - e2e/lynx-rspeedy.test.ts
---

# Lynx 文字探针必须使用实际消费节点

## 症状

严格像素检查下，字体粗细、文字颜色 type hint 和任意后代选择器的 probe/control 图片相同。提交52d34c8ee的 [Android原生运行37347746026](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37347746026) 已通过新runId、实际bundle哈希、落盘回执与PNG检查，最终失败于原生结论和旧基线不一致；其绿色 diagnostic job 不能代表验收通过。

## 根因与纠正

CaseCard将所有类统一放在view上。实际TASM的 `sourceContent.config.enableCSSInheritance` 为false，文字却是子text；color还被子节点的白色覆盖。字体/颜色类没有交给实际文字节点消费。任意后代用例要求 `.target`，模板只有 `.probe-target`，选择器没有匹配对象。

字体粗细、文字装饰、颜色透明度及颜色type hint的像素用例现在将类放在text自身，control使用相同内容和结构但不携带被测类。双方文字节点都有真实target标记，任意后代类仍留在父view。边框、透明度、交互类仍由原view消费；固定父画布、节点身份和严格像素门槛不变。

这是测试夹具消费边界的修正，不应通过开启全局CSS继承或重写产品样式掩盖。暗色、背景尺寸、filter等其它差异仍需独立核对，不能因为修正文字夹具而批量标为支持。

## 验证

新增测试导入实际CaseCard，以真实JSX runtime生成元素树，不mock组件或复制模板。4项文字消费和1项target缺失回归在原实现失败，修正后全部6项通过；额外断言control内容一致以及非文字样式和捕获画布保持原归属。

- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx exec vitest run src/components/CaseCard.test.ts --update=none`
- `CI=1 pnpm e2e:lynx:static:update` 限定React Lynx显式重建；118项static结论、声明及catalog hash均不变，仅记录本轮生成时间。
- `CI=1 pnpm e2e:lynx --update=none` 执行示例回归和真实包/Rspeedy/encoder产物验证。

## 适用边界

元素树和static验证不能替代原生运行。必须在最终提交重新采集双端图片，确认每项期望实际生效；原生支持基线未修改。本地完整验收仍受当前会话原生Chrome computer-use工具缺失阻断，本机Xcode27与固定Lynx4.0.1编译另有已记录限制。

## 规则评估

不新增AGENTS，不涉及公开包版本提升。现有“组件属性必须有真实消费方”规则由组件级回归落实。
