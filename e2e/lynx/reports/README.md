# Lynx 原生报告

这里的 `ios.json` 与 `android.json` 只能由 Lynx Engine `4.0.1` 的真实原生 e2e 产出。报告必须记录实际设备名、型号、系统版本/build、runtime、Android API、ABI、视口和像素比；本地模拟器与 CI 允许使用不同系统版本，case 结论变化仍需显式审查。

原生命令先把报告写入 `e2e/.artifacts/lynx-native/`，并把 probe/control 的 PNG 裁剪写入 `crops/`。审查截图、裁剪、运行时错误和逐 case checkpoint 后，将两份报告作为 `LYNX_IOS_REPORT`、`LYNX_ANDROID_REPORT` 传给 `pnpm e2e:lynx:update`。更新器会拒绝单端报告、过期 catalog、版本不一致、重复 ID、缺失 case、`not-tested` 或无 checkpoint 的结果。

几何 case 必须同时有 probe 与 control 的尺寸测量；像素 case 必须有两个局部截图；动画/transition 必须有时间序列 checkpoint。需要真实输入注入的 `active`、`hover`、`pointer-events` case 在 host 尚未注入时保持 `not-tested`，不能手工改成不支持或支持。

运行验收与基线更新都读取报告旁 `crops/` 的原始 PNG，拒绝缺失、损坏或不能支撑通过结论的截图。两图必须尺寸一致，再比较解码后的可见 RGBA；PNG 压缩、隐藏的透明 RGB、边缘宽高取整差异不能证明样式生效。一像素宽度变化也会改变渐变插值，因此不自动裁剪或缩放来凑齐尺寸。动画及 transition 的相邻 checkpoint 也遵循此要求。更新基线不能只提供 JSON 或回读本目录的已提交报告。

这项校验是支持结论的必要证据，不能证明截图包含父节点合成的透明度、裁剪、滤镜等效果，也不能代替逐 case 的语义审查。失败保留原报告与截图，不自动改写状态或刷新基线。历史报告中的一像素尺寸差异假阳性见[复盘](../../../docs/engineering/lessons/lynx-pixel-evidence.md)。

像素及动画用例的 `probe-container-*` / `control-container-*` 是相同大小的固定父画布，Android 使用 `flatten=false` 保留原生 view。采样父画布以包含子节点的可见性、透明度、边框和变换，状态注入仍作用于 `probe-*`。Android 不向上猜测可截图祖先或按窗口边界裁剪；iOS 绘制失败不返回空白 PNG。原生尺寸与内容仍由上述 PNG 门禁核对，不能仅凭画布配置视为通过。

禁止根据 `@lynx-js/css-defines` 或静态 encoder 结果手工填写这里的报告。
