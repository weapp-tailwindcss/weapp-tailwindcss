---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c53b5029a729efe881e8763d6a6e1505dd3d7998
regressions:
  - e2e/lynx-evidence.test.ts
  - examples/react-lynx/src/compatibility/native-geometry.test.ts
---

# Android 原生几何证据必须包含变换

## 症状

[Android 运行 37356795751](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37356795751/job/111921134357) 中，transform-origin 和 skew 的原始矩形仍与未变换布局相同。单靠这些矩形无法证明 Lynx 不支持变换。

## 根因与纠正

固定版本 Lynx 4.0.1 的 `LynxBaseUI.getRectToWindow()` 使用布局宽高，只增加屏幕原点。Reporter 提供了 measure 方法后，JS 的内置 boundingClientRect 后备路径不会执行，因此其中的 androidEnableTransformProps 无法补救。

改用公开的 `getTransformValue(0,0,0,0)`。该方法沿祖先链应用矩阵、布局偏移及滚动，并加入根视图屏幕位置。采集四个顶点的浮点最小/最大值形成外接矩形，再用同一 Lynx context 的 screen density 转成逻辑坐标。所有节点和参考容器均走同一屏幕坐标系，不混用布局与变换坐标。

不能只读取左上与右下：旋转和负缩放会改变顶点顺序。也不能先转成整数 Rect，否则非整数 density 下的小数几何证据会丢失。无效顶点、密度和空区域返回缺证，不产生伪造矩形。

iOS 现有 convertRect 路径已经包含变换，本次未修改其行为。

## 验证

- 只读检查实际 4.0.1 runtime.jar 的 javap 字节码，核对两条 API 的语义和公开签名。
- `CI=1 pnpm exec tsx e2e/lynx/test-evidence-store.ts android`：现有存储回归及新增 5 组有效几何、11 组无效输入通过。[原生 Java 回归](../../../e2e/lynx/fixtures/evidence-store/GeometryBoundsTest.java)真实执行生产 Java 类，覆盖 90°、45°、负缩放、屏幕负坐标和 2.625 密度；未用 Android stub 方法冒充实际矩阵运算。
- 下游 native-geometry 与 lynx-evidence 回归继续校验原始矩形及同条件参考系。
- 在本任务临时 host 副本执行 Gradle `:app:compileDebugJavaWithJavac -PlynxCompileSdk=36 --offline --no-daemon`，完整 host 编译通过，确认所用 API 与固定依赖兼容。
- TypeScript 编排的定向 ESLint、规则和差异检查通过。

现有 Android CI 存储测试入口同时执行几何测试，失败会阻止设备运行。

## 适用边界

本地编译没有安装或运行 APK。Java 数学回归不能替代原生矩阵消费验证，后续 CI 必须审查新报告中的 origin/skew 及普通布局原始矩形。未刷新原生支持基线，未将现有失败改成跳过。

## 规则评估

不新增 AGENTS，不改变公开包。原生宿主拥有测量坐标转换，JS 与报告层继续校验完整原始矩形。
