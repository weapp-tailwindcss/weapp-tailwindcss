---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ce65d062656a8a116d0891f76b46ef5d2d4f512a
regressions:
  - e2e/lynx-pixel-effects.test.ts
  - e2e/lynx-pixel-evidence.test.ts
  - e2e/lynx-evidence.test.ts
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
---

# 图片变化不等于预期渐变或阴影生效

## 症状

[Android 运行 37360084877](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37360084877/job/111932213274) 的 118 项报告通过原始几何、run ID、bundle 哈希及 PNG 字节校验，其中渐变和阴影被标成 supported。然而图片只显示灰色渐变变为纯蓝、红色默认阴影消失，没有预期的蓝绿黄渐变和黑色模糊阴影。

四张原始图保存在 `e2e/lynx/fixtures/pixels/`，来自 ce65d0626、Lynx 4.0.1、Android 11 API 30 x86_64 模拟器，run ID 为 `e2570de1-a85c-4d76-be42-76bf8215676a`。这些图只用于负回归，不是支持基线。

## 根因与纠正

采集端直接使用 PNG 编码指纹差异决定支持；宿主只进一步检查可见像素不同。无效 utility 覆盖默认样式后，同样满足这个弱条件。

实际 CSS/TASM 保留了渐变和阴影变量，但最终值中还有嵌套 `var(...)`。本轮 `targetSdkVersion=3.9` 产物使用旧的 `css_var/{{…}}` 路径：Lynx 4.0.1 的 `GetCSSVariableByRule` 只替换当前占位符，`GetCSSVariableValue` 直接返回变量字符串，随后交给属性解析器，并不递归展开。源码另有 `NeedsVariableResolution` 分支，不能泛化为所有 Lynx 4.0.1 变量路径都不支持嵌套。因此 bundled 不能证明本轮效果可绘制；跨选择器提前替换动态变量也不是安全的兼容修复。

后续已找到正式模板配置入口，构建与解码回归见[递归变量配置复盘](lynx-recursive-variable-config.md)；双端真实效果仍待新报告，不能由该配置推定成功。

版本依据为 CocoaPods 的 4.0.1 podspec 所引用的[官方发布源码 ZIP](https://github.com/lynx-family/lynx/releases/download/4.0.1/Lynx-4.0.1.zip)：`core/renderer/css/css_variable_handler.cc` 第 49–65、109–186 行，以及 `core/renderer/dom/attribute_holder.cc` 第 191–207 行。前者 SHA-256 为 `69fbdf4a282639ae569f7fbd1c3ece1ff7c5285ef558e4bea2d92a75ee33a727`，本任务的调度器回移未修改此文件。

这两个用例现在只由设备提交原始图片与待判定状态。宿主先校验本轮身份和全部 PNG 字节，再解码像素并生成独立最终报告；原始报告和图均保留。读取最终报告及刷新基线时，必须按固定 `pixel:expected-effect-v1` 契约重算并核对状态、原因、统计和 checkpoint。

- 渐变在两条空白横线的七个位置验证 sRGB 连续插值及方向，同时检查与背景颜色无关的装饰锚点和外部画布。纯蓝、灰色默认渐变、反向渐变、三色硬条纹和单个正确像素均不支持该效果。
- 阴影先验证同几何主体与对照，再检查主体下方两列的中性黑色变暗以及多个距离的衰减。删除红环、红色阴影、无模糊的硬灰块不能通过。
- 缺图、损坏 PNG、尺寸不一致、透明画布、主体或对照缺失属于证据无效并阻断；只有完整图明确未呈现效果时才判运行时不支持。

## 验证

- 两项假阳性先在旧实现复现；审查补充的有限高度硬灰块和不透明空白图也先失败后修复。
- 效果回归覆盖原始 Android PNG、1/2.625/3 倍画布、连续渐变正例和错误效果负例。
- 证据测试覆盖原始报告不被修改、预先声明结论被拒绝、效果契约缺失/伪造/重复和无效图片不能降级为 unsupported。
- `CI=1 pnpm e2e:lynx --update=none` 包含示例、真实包/Rspeedy 构建、编码/解码、报告与 PNG 验证。定向类型、ESLint、agents 和差异检查随提交执行。
- 显式限定 React Lynx 执行 `CI=1 pnpm e2e:lynx:static:update`：118 项结论和 catalog hash 不变，仅生成时间变化，随后无更新验证。

## 适用边界

原始 Android 两项效果确实缺失，新逻辑未把既有失败改成通过，未修改原生支持基线。当前阴影正例是独立生成的像素算法用例，不能替代原生模糊算法验收；最终双端仍需本轮完整报告和图片。

其余 generic pixel 用例仍只有可见差异的必要条件，不能据此宣称所有功能都已通过语义像素验收。固定画布、布局、颜色或 utility 语义变化时必须同步审查契约，不扩大容差掩盖差异。

## 规则评估

不新增 AGENTS，不改变公开包。采集、证据校验、效果判定和显式基线更新保持独立边界。
