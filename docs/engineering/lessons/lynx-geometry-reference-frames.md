---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 794fc35c45f7371bdf0c76315684bc4cdd42888f
regressions:
  - examples/react-lynx/src/compatibility/native-geometry.test.ts
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - e2e/lynx-evidence.test.ts
---

# Lynx 几何验收的参考坐标系

## 症状

像素取证修复后继续审查几何报告，发现52d34c8ee的真实Android报告中，box-sizing、grow、字体尺寸、tracking等多项probe/control尺寸及子节点偏移完全相同，却标为supported。实际[运行37347746026](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37347746026)的截图协议已通过，不能据此推定几何断言也正确。

## 根因与纠正

两组控件在左右两列，原逻辑直接比较屏幕left/top。固定列偏移就足以让大多数geometry用例通过；报告反而将节点相对自身的坐标打印成0,0，丢失判断所依赖的真实位移。容器、子节点缺失和非有限坐标也没有阻止其它差异将结果标为支持。

将几何采集与比较从reporter拆出，逐组绑定probe/control、参考容器和子节点。只比较节点相对各自容器的位置、尺寸，以及子节点在各自父节点内的偏移；保留原大于1的差异门槛。缺少任一测量、非有限坐标、空区域或容器尺寸不一致时报告not-tested，由完整报告验收拒绝，不能当作平台不支持。

精确尺寸用例继续核对期望值；aspect必须符合4:3，不能只因高度变化就宣称支持。定宽和响应式宽度也必须相对control有实际宽度差异。报告增加结构化geometry字段保留六份原始矩形，checkpoint记录真实局部坐标。实时验收与更新器共用纯比较函数，重算原始矩形对应的结论及checkpoint，缺证或不符均拒绝。历史报告可用于展示与诊断，不能重新验收；原生支持基线没有自动改写。

## 验证

通过实际submitNativeCompatibilityReport入口，注入明确的原生测量回执，验证同布局在横向、纵向及负坐标原点下不应通过。原实现13项回归中12项失败，包含缺容器、缺子节点、NaN/Infinity、参考尺寸不一致与丢失实际偏移。修复后21项定向回归通过，原截图和回执测试继续通过。另有2项完整读取入口反例证明旧实现接受缺失几何和固定列偏移假阳性，现已拒绝。JSON字段重排回归避免把原生序列化的属性顺序误判为证据变化。

- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx exec vitest run src/compatibility/native-geometry.test.ts src/compatibility/native-reporter.test.ts --update=none`
- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx exec tsc --noEmit --pretty false`
- `CI=1 pnpm e2e:lynx:static:update` 限定React Lynx重建，之后运行 `CI=1 pnpm e2e:lynx --update=none` 核对真实构建、encoder和静态证据。

## 适用边界

新增单测证明比较不再受到固定屏幕原点污染，不等于全部布局能力已经验收。52d34c8ee报告中的aspect为72×48，原夹具min-width影响了64px宽度；字体、grow、grid-placement等还需各自具备有效消费节点与约束条件。修正比较后暴露的新失败需要继续定位，不能用旧supported基线掩盖。

794fc35c4的Android hosted运行在安装时返回 `Can't find service: package`，未产生原生报告；这是本轮环境失败证据，不能用来判断opacity、文字夹具或本修复通过。当前会话仍缺原生Chrome computer-use工具，本地完整验收保持阻断。

## 规则评估

不新增AGENTS，不提升公开包版本。以实际采集入口回归与明确坐标系落实既有证据要求；原生报告中的supported必须由被测样式效果支撑。
