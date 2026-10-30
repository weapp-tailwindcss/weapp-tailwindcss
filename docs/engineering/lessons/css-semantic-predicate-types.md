---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f9f0cd0aad68f3e0774790d15b87fc443c7ef4e8
regressions:
  - packages/postcss/test/mini-program-css.test.ts
  - packages/postcss/test/root-cleanups-selectors.test.ts
  - packages/postcss/test/selectorParser.test.ts
---

# CSS 内容分类与节点种类判别

## 症状

依赖升级后的 scripts 标准严格类型检查在小程序 CSS 裁剪及 selector 转换中报告普通 Rule、Pseudo 为 never。继续加非空断言或强转，只会掩盖分类函数本身的错误声明。

## 根因与纠正

`isMiniProgramPreflightRule`、`isBrowserElementPreflightRule` 和 `isMiniProgramThemeVariableRule` 判断的是规则内容是否属于某一类，却声明为 `node is Rule`。这个声明同时表示：返回 false 时，输入就不是 Rule。实际普通 class 规则也是 Rule，因而已由 walkRules 确认的节点在 false 分支被错误排除。RTL 特定伪类分类器对已确认的 Pseudo 有相同问题。

四个内容分类器明确返回 boolean。小程序分类器接收 PostCSS 的 AnyNode 判别联合，保留 comment、at-rule、declaration、root、document 的非匹配语义；只有 `node.type === 'rule'` 才进入规则内容判断。theme 和 preflight 收集器分别在需要 Rule 操作的边界显式判别。单个 selector 也在 Map 查询前检查实际取值，不用断言隐藏索引边界。RTL 分类体与集合保持原样。

这修复的是类型契约。现有证据没有显示对应 CSS 输出发生了运行时错误，不把原有通过结果重新归因为本次修复。

## 验证

在本任务独立依赖工作树、Node24.22.1/pnpm12.15.0、包含本地改动的源码下：

- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/mini-program-css.test.ts test/root-cleanups-selectors.test.ts test/selectorParser.test.ts --update=none`：3文件82项通过。新增边界要求普通 Rule 不命中这些分类时仍可消费 selector/nodes，其他五类节点全部返回 false；既有用例覆盖主题、preflight、普通 class/id、复杂原生标签、嵌套清理、RTL 以及 before/after/root 伪类。
- 原配置 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false`：98→72条诊断，26条相关错误消失，整体仍失败。没有修改 flags、noCheck 或源码包含范围。

## 适用边界

PostCSS 包自己的 tsconfig 仍带既有 noCheck，普通构建不代表严格类型验收。本次使用原 scripts 严格入口观察其实际消费的源码，剩余错误继续阻断整包类型通过。内部内容分类签名和收集边界变化不改变正式 RSS 预算、原生事件链路或平台支持范围。

## 规则评估

不新增 AGENTS 条目。现有“先修根因、按 AST 所有权划分边界、补回归”的规则充分；不要将所有按内容命名的函数统一改为类型守卫，也不要因本轮错误数量扩大到不相关判别函数。
