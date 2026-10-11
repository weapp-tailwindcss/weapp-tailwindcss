---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - e2e/demo-visual-style-isolation.test.ts
---

# 视觉变体的条件 manifest 属性修改

## 症状

微信视觉矩阵中，uni-app x 默认变体通过，style-isolation-v2 在 HBuilderX 编译阶段报 manifest 缺少逗号，外层只显示 watch 进程提前退出。

## 根因与纠正

旧脚本通过正则删除字符串值 `"2"`，遗漏数字值 `2`，且删除范围未限定在 `uni-app-x` 对象。追加属性时按文本末尾补逗号，逗号落入 `// #endif` 行注释；目标平台预处理后配置失效。只扩大正则匹配数字不能解决注释、嵌套对象和条件分支边界。

改用现有 TypeScript JSONC 语法节点定位 `uni-app-x` 的直接属性，按属性与逗号 token 范围删除，保留条件指令和其他对象。v2 属性插入条件块之前，保证每个目标平台都能读取本轮选择的版本。运行结束仍由调用方恢复原始 manifest。

## 验证

- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-visual-style-isolation.test.ts --update=none`：修复前 5 失败、1 通过；修复后 6 通过。
- 使用 demo 实际依赖的 uni 条件预处理器和 JSONC 解析器，核对 H5 与微信结果、数字/字符串、嵌套同名属性、注释、幂等与原文恢复。
- 定向 ESLint 通过；真实 DevTools 视觉变体复验尚待完成，不能用上述单测替代。

## 适用边界

仅修复测试配置变换，不修改产品样式转换逻辑，不更新视觉或 static 基线。首次失败发生于 HBuilderX 5.24.2026081301。本轮原始编译错误与截图保留在 local-full-run 报告。

## 规则评估

不新增 AGENTS 规则。通过持久回归落实既有根因修复和条件编译边界要求。
