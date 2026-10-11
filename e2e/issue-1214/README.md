# #1214 的真实构建与尺寸验收

`project.ts` 创建独立临时 uni-app 项目，并验证消费的是当前工作树的 `weapp-tailwindcss` 构建产物。`ide-project.ts` 保存尺寸对照页的源码：同一页面左列使用 `w-32 h-32 p-4 -mt-4 gap-4`，右列直接使用最终 `256rpx`、`32rpx` 与 `-32rpx`。主题基数为 `8rpx`。

## 定向静态回归

先构建当前包和依赖，再运行：

```bash
pnpm --filter weapp-tailwindcss... run build
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1214-layout-static.test.ts e2e/issue-1214-layout.test.ts --update=none
```

首次生成或明确修正页面后，只更新本项目基线，再运行上面的不更新验证：

```bash
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1214-layout-static.test.ts -u
```

静态基线位于 `e2e/__snapshots__/issue-1214/ide-layout.json`，同时记录真实 WXML 与 WXSS 关键声明。

## 微信 DevTools 验收

按 [本地多端手册](../LOCAL-MULTI-PLATFORM-E2E.md) 完成本轮环境准备；全面验收必须通过当前预检和 computer use 门禁。授权或设备环境阻断时，不得把下列用例未执行或跳过记为通过。

配置 `E2E_PREFLIGHT_WECHAT_CLI` 指向本轮微信 IDE 官方 CLI 后执行（`cross-env` 同时适用于 Windows/macOS/Linux）：

```bash
pnpm exec cross-env E2E_IDE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1214-ide.test.ts --update=none
```

用例强制使用 DevTools provider，同一用例只启动一次连接。每次重新构建临时项目，并核对当前页面唯一 marker。通过公开的 [`miniProgram.evaluate()`](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/miniprogram.html) 只读调用 `wx.createSelectorQuery().boundingClientRect()`，在同一次 `exec()` 中读取两组节点。该接口的官方示例支持等待返回的 Promise；采集函数通过参数接收选择器，不引用外部闭包。宽高、坐标均来自同一批原生矩形，不混入整数 `offsetWidth/offsetHeight`。padding 来自父子偏移，负 margin 来自相邻元素位置，gap 来自两个子元素间的实际坐标差。

断言要求工具类与直接最终 `rpx` 的控制组几何值相等，只容忍坐标相减的浮点误差（`0.000001px`），并要求节点 ID 正确、矩形非空且各字段为有限数、正间距非零、负 margin 方向正确。静态回归独立严格校验工具类的最终长度和控制组的字面量 WXML；仅有两组相等或只读到 CSS 声明都不足以证明修复。

[微信 WXSS 文档](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html) 明确指出 `rpx` 换算有时会取整，并未保证与 `窗口宽度 / 750` 的偏差小于半像素。因此理论比例及两组相对理论值的偏差只记入证据，不作为通过条件；原生直接长度控制组承担当前平台实际换算的基准。[`NodesRef.boundingClientRect` 文档](https://developers.weixin.qq.com/miniprogram/dev/api/wxml/NodesRef.boundingClientRect.html) 定义了相对显示区域、以像素为单位的布局矩形。这一合同不扩大两组差异容差，也不把旧设备结果当成本轮通过证据。

证据输出到 `e2e/.artifacts/issue-1214-ide/run-*/`：构建日志、真实 WXML/WXSS、微信 IDE 版本、基础库 `SDKVersion`、模拟设备型号与系统、窗口尺寸、完整原生矩形读数 `rawRects`、提取的两组矩形、比较结果、视口截图及原始截图。证据缺失或几何信息无效直接失败；失败时追加现场截图与 IDE 诊断。这个用例证明指定微信 DevTools 环境的尺寸行为，不能代替真机或其他平台验收。
