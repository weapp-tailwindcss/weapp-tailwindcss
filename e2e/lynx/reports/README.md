# Lynx 原生报告

这里的 `ios.json` 与 `android.json` 只能由 Lynx Engine `4.0.1` 的真实原生 e2e 产出。报告必须记录实际设备名、型号、系统版本/build、runtime、Android API、ABI、视口和像素比；本地模拟器与 CI 允许使用不同系统版本，case 结论变化仍需显式审查。

每轮使用独占的新输出目录，`--output` 指向已存在目录时在任何设备命令前拒绝。原生命令先把报告写入 `e2e/.artifacts/lynx-native/`，并把 probe/control 的 PNG 裁剪写入 `crops/<runId>/`。审查截图、裁剪、运行时错误和逐 case checkpoint 后，将两份报告作为 `LYNX_IOS_REPORT`、`LYNX_ANDROID_REPORT` 传给 `pnpm e2e:lynx:update`。更新器会拒绝单端报告、过期 catalog、版本不一致、重复 ID、缺失 case、`not-tested` 或无 checkpoint 的结果。

几何 case 必须在 `geometry` 中同时保留 probe/control、各自参考容器及子节点的六份原始矩形；只比较容器内的局部位置、尺寸和子节点偏移，左右两列的屏幕原点差异不能算样式效果。缺失、非有限、空区域或参考容器尺寸不同均为未测，不能刷新基线。实时验收和更新器会从原始矩形重算结论与 checkpoint；历史报告缺少几何证据时只可展示，不能重新验收。像素 case 必须有两个局部截图；动画/transition 必须有时间序列 checkpoint。需要真实输入注入的 `active`、`hover`、`pointer-events` case 在 host 尚未注入时保持 `not-tested`，不能手工改成不支持或支持。

运行验收与基线更新都读取报告旁 `crops/<runId>/` 的原始 PNG，拒绝缺失、损坏或不能支撑通过结论的截图。两图必须尺寸一致，再比较解码后的可见 RGBA；PNG 压缩、隐藏的透明 RGB、边缘宽高取整差异不能证明样式生效。一像素宽度变化也会改变渐变插值，因此不自动裁剪或缩放来凑齐尺寸。动画及 transition 的相邻 checkpoint 也遵循此要求。更新基线不能只提供 JSON 或回读本目录的已提交报告。

这项校验是支持结论的必要证据，不能证明截图包含父节点合成的透明度、裁剪、滤镜等效果，也不能代替逐 case 的语义审查。失败保留原报告与截图，不自动改写状态或刷新基线。历史报告中的一像素尺寸差异假阳性见[复盘](../../../docs/engineering/lessons/lynx-pixel-evidence.md)。

像素及动画用例的 `probe-container-*` / `control-container-*` 是相同大小的固定父画布，Android 使用 `flatten=false` 保留原生 view。采样父画布以包含子节点的可见性、透明度、边框和变换，状态注入仍作用于 `probe-*`。Android 不向上猜测可截图祖先或按窗口边界裁剪；iOS 绘制失败不返回空白 PNG。原生尺寸与内容仍由上述 PNG 门禁核对，不能仅凭画布配置视为通过。

禁止根据 `@lynx-js/css-defines` 或静态 encoder 结果手工填写这里的报告。

实时报告使用 `evidence.version: 1`，`run-context.json` 和 `main.lynx.bundle` 与报告一起保存。runner 生成唯一 runId；两个原生 host 计算实际加载 bundle 的 SHA-256，写图后返回 runId、文件名、PNG 字节哈希及长度，全部确认后才发布报告。文件写入失败、迟到/旧 run 回执、重复帧及复制失败均拒绝继续。每个平台的原生证据也写入 `lynx-compat/<runId>/`，不复用旧报告或截图。

更新器核对独立的 run context、bundle 和完整帧清单，再逐文件验哈希、解码 PNG 和比较可见像素。历史 `schemaVersion: 1` 报告仍可展示和比较结论，但缺少新版证据不能重新验收或更新基线。不要单独复制 JSON；保留整份运行目录。存储回归可分别运行 `pnpm exec tsx e2e/lynx/test-evidence-store.ts android` 和 macOS 上的 `pnpm exec tsx e2e/lynx/test-evidence-store.ts ios`；后者验证 iOS 使用的 Foundation 存储实现，不等同于模拟器像素验收。
