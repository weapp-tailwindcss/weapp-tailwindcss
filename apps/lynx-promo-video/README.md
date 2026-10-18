# `@weapp-tailwindcss/lynx` 宣传视频

75 秒、1920×1080、30 FPS 的中英文 Remotion 宣传片。核心演示为真实的“保存 → 构建 → 重新加载 → 原生结果”，统一称为“原生更新”。公开插件 API 保持不变。

本说明对应头像重制版的复现流程。新版最终成片、两端实录和完整回看的验收结果在本轮 `out/verification.json` 中登记，完成前不以旧报告代替。[2026-10-18 旧版交付记录](history/legacy-delivery-2026-10-18.md)单独保留，其旧素材与摘要不能用于本轮验证。

## 画面与真实示例

取景参考 [Tailwind CSS 官网首页](https://tailwindcss.com/)的代码与真实图片结果并置方式：编辑时保留原生预览，结果镜头突出真实卡片与照片，随后用同位置截图比较。代码、图片和页面均来自当前示例，不用整张桌面缩小播放。

实际编辑入口为 `examples/react-lynx-promo/src/components/BuildStatus.tsx`。卡片固定展示作者 [sonofmagic](https://github.com/sonofmagic)、`weapp-tailwindcss`、`Tailwind CSS × Lynx` 与 `Style with utility classes`。标题 20px、正文 16px、文字为白色；照片为真实 `<image>` 元素，尺寸由 `h-[128px] w-[128px]` 控制。

头像来源为 [GitHub 头像原图](https://avatars.githubusercontent.com/u/15621541?v=4)，2026-10-19 下载并保存在 `examples/react-lynx-promo/src/assets/github-avatar.jpg`。Rspeedy 设置 `output.dataUriLimit: 0`，输出独立 JPEG，bundle 引用其资源 URL；不使用 data URL。当前产物名为 `static/image/github-avatar.c8fbe79669.jpg`，实际名称以当轮构建和资源清单为准，不能靠文件名判断对应关系。

同一卡片连续经过三个阶段；头像圆角与卡片同步变化，文字和照片内容保持固定：

| 阶段 | 卡片内边距 | 卡片与头像圆角 | 卡片背景 |
| --- | --- | --- | --- |
| `initial` | `p-[8px]` | `rounded-[4px]` | `bg-[#1e40af]` |
| `spacing` | `p-[24px]` | `rounded-[28px]` | 保持蓝色 |
| `color` / 提交的最终态 | 保持 24px | 保持 28px | `bg-[#047857]` |

间距和圆角使用显式 px 任意值。第一轮保存内边距修改，并将卡片与头像两处圆角从 4px 改为 28px；第二轮只修改背景色。每轮在录制中的集成终端运行：

```bash
pnpm --filter @weapp-tailwindcss/example-react-lynx-promo build
```

保留真实保存、当轮命令、构建成功及宿主重新加载后的页面。构建结果以终端日志和原生结果为准；本片采用 build + reload，不宣称 HMR，也不承诺应用动态变量在全部场景中保持不变。构建等待只剪去，操作和视频按正常速度播放；跳切明确标注“已剪去构建等待 / Build wait trimmed”。

## 分镜与开发段节奏

| 成片时间 | 画面 |
| --- | --- |
| 0–5 秒 | 品牌与最终原生效果 |
| 5–13 秒 | 编辑器中的真实 Rspeedy 插件配置 |
| 13–43 秒 | 两轮代码修改、真实构建、原生结果与前后比较 |
| 43–49 秒 | 已确认的 CSS 生成与 Lynx 编码流程 |
| 49–61 秒 | 最终绿色状态的 iOS、Android 页面与滚动 |
| 61–70 秒 | 兼容性证据、基线日期与支持边界 |
| 70–75 秒 | 对应语言的接入文档和二维码 |

开发段严格为 900 帧。每轮 450 帧，使用相同节奏：

| 轮内时间 | 帧数 | 取景与要求 |
| --- | --- | --- |
| 0–1 秒 | 30 | 修改前原生卡片，展示宽度至少 720px |
| 1–5 秒 | 120 | 实际代码编辑，关键代码至少 32px，旁边保留真实原生预览 |
| 5–8 秒 | 90 | 真实保存、当轮构建成功与重新加载；剪去等待时明确标注 |
| 8–12 秒 | 120 | 原生结果为主，卡片展示宽度至少 720px |
| 12–15 秒 | 90 | 真实前后截图并排，每张卡片至少 660px，标注“修改前／修改后” |

前后素材采用相同裁切位置、比例和顶部锚点，避免缩放抵消内边距变化。第一轮说明“内边距 8→24px、圆角 4→28px”，第二轮说明“蓝→绿”；提示线指向真实变化区域。截图停留独立计算时长，不重复播放旧视频填满时间。

## 工具链、设备与图片资源

设备操作遵循[本地多端手册](../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。录制目标为 iPhone 17 Pro 模拟器和已安装的 Pixel 9；实际 OS、设备 ID、Lynx Engine、编码目标及装载 bundle 以当轮 `device.json`、构建记录和素材清单为准。

Android 需要 Java 17、Gradle 8.9 或兼容的更新 8.x，以及 fixture 声明的 Android SDK platform / Build Tools。路径通过 `LYNX_JAVA_HOME`、`LYNX_GRADLE`、`ANDROID_HOME` / `ANDROID_SDK_ROOT` 配置；两个 SDK 环境变量同时存在时应指向同一 SDK。iOS 需要 Xcode、XcodeGen 与 CocoaPods，可用 `LYNX_POD` 指定 CocoaPods。使用 `LYNX_IOS_DEVICE_ID`、`LYNX_ANDROID_DEVICE_ID` 绑定设备，不把机器绝对路径写入项目。

恢复最终源码后，在仓库根目录采集独立双端素材：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video capture:ios
pnpm --filter @weapp-tailwindcss/lynx-promo-video capture:android
```

入口实际构建 Demo，再向 `e2e/lynx/run-native.ts` 传入 `--capture-only --bundle` 和 `--assets`。`--assets` 指向本轮完整 `dist`：runner 保留 bundler 资源名，将独立 JPEG 复制给临时宿主的图片加载器，并归档 `capture-assets/` 与 `capture-assets.json`。这是录制专用宿主的资源配置，不是 `@weapp-tailwindcss/lynx` 的公开选项；开发服务器正常提供构建出的图片资源。

每轮在工程 `.capture/` 下分配独占新目录。入口创建父目录，原生 runner 独占创建 `raw/`，调用方不要预建它。失败时保留原目录和证据，重试使用新目录；已发布的设备视频、封面和清单在替换前保存到 `.capture/previous-*/`。

原始设备录像保留，公开副本归一化为 720px 宽、30 FPS、H.264、无音频。请求时长为 18 秒，实际可用时长需要测量；`NativeScene` 从第 70 帧取 12 秒，两端至少需要 `70 / 30 + 12` 秒。iOS 使用录制 fixture 驱动真实滚动容器并记录偏移，Android 使用真实设备滑动；最终布局、头像加载与滚动均须人工核对。

## 原片、阶段归档与剪辑清单

先完成示例、测试和布局调整，再开始录制。用专用编辑器窗口、大字号集成终端和模拟器连续录制两轮修改；保留完整桌面原片和独立原生录屏。不要用合成打字、重复设备片段或重演成功日志替代实际操作。

默认清单为 `public/captures/manifest.json`，可用 `LYNX_PROMO_CAPTURE_MANIFEST` 另行指定。路径相对清单所在目录解析。每个阶段归档 `src/`、`lynx.config.ts`、`package.json`、实际 bundle、独立图片资源、原生截图与操作时间点；源码快照包括本地头像文件。使用 `snapshotSources`、`digestFile` 和 `manifestRelativePath` 生成真实摘要。

`initial`、`spacing`、`color` 必须绑定各自源码、bundle 和资源摘要。`spacing` 与 `color` 的源码及 bundle 应不同；最终 `color` 对应最终工程和双端实际装载产物。后续改动源码、配置或图片会使素材身份变化，需要重新采集或重新建立可核对的对应关系。

新版剪辑使用 `development.shots`，保留 `clips` 以兼容旧素材。主要字段为：

| 字段 | 含义 |
| --- | --- |
| `development.rawVideo` / `video` | 完整桌面原片与归一化开发录像 |
| `events` 的 `rawStartSeconds` / `rawEndSeconds` | 操作在完整原片中的区间 |
| `events` 的源码、bundle、`assetsRoot` / `assets` | 阶段归档与独立图片资源摘要 |
| `shots[].kind: video` | 实际视频镜头；记录阶段、事件、素材摘要、源区间、裁切、展示宽度和帧数 |
| 视频镜头 `view` | `config`、`before`、`editor`、`terminal` 或 `result` |
| 视频镜头 `preview` | 编辑时保留的真实原生截图及来源 |
| `shots[].kind: comparison` | 前后真实截图；独立记录 `displayFrames` |
| 截图 `sourceVideo` / `sourceSeconds` | 截图来源录像、摘要和实际取帧时间 |
| 截图 `crop` / `cardRect` / `outputWidth` | 裁切区域、原生卡片区域与最终展示尺寸 |

视频镜头保持素材时间顺序，`playbackRate` 为 1。截图必须来自对应阶段实际展示的原生录像，取帧时间应落在有效源区间；前后图不能使用同一个文件或相同摘要。校验覆盖裁切越界、阶段身份、实际展示字号与宽度、截图来源、配置 240 帧和开发段 900 帧。`assets` 从清单生成 `src/generated/development.json`，不要手改生成文件绕过校验。

## 旁白、字幕与兼容性来源

先明确绑定兼容性截图，通过 `LYNX_PROMO_COMPATIBILITY_SCREENSHOT` 或 `manifest.compatibility` 指定文件与来源，再准备素材：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video assets
pnpm --filter @weapp-tailwindcss/lynx-promo-video fonts
```

TTS 使用 `edge-tts` 的 `zh-CN-XiaoxiaoNeural`、`en-US-AriaNeural`，语速 `+8%`，生成需要网络；预览与渲染读取本地素材。逐句计划在 `scripts/media/narration-plan.ts`，原始 MP3/VTT 与 `plan.json` 保存在对应场景的 `*-parts/`，字幕按实际语音起止对齐新镜头。配置、开发与流程说明的旁白调整后，应重新生成对应音频、SRT/VTT 和字体子集。

兼容性统计继续读取 `examples/react-lynx/src/compatibility/baseline.json`：2026-10-06 已提交双端基线共 118 项，其中 45 项支持、72 项不支持、1 项平台差异，历史环境为 iOS 26.5 与 Android 11 / API 30。当前设备的 capture-only 截图展示运行画面，不能视为已在该设备重验全部 118 项；画面应显示基线日期及截图来源。

## 预览、验证与交付

先执行定向检查；static 更新只限宣传 Demo，命令与边界见[示例说明](../../examples/react-lynx-promo/README.md)。正常测试设置 `CI=1`，快照以 `--update=none` 验证：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video test --update=none
pnpm --filter @weapp-tailwindcss/lynx-promo-video typecheck
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-promo.test.ts --update=none
```

素材校验通过后，先导出开发段预览。例如在播放器中以正常速度、静音审看以下 960×540 预览：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video assets
pnpm --filter @weapp-tailwindcss/lynx-promo-video exec remotion render src/index.ts LynxPromoZh out/development-preview-zh.mp4 --frames=390-1289 --scale=0.5 --codec=h264 --pixel-format=yuv420p
```

两次变化必须直接可辨认，代码、当轮构建结果和原生更新的对应关系应清楚；不达标时继续调整取景。确认后再渲染两版完整视频与封面：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:frames:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:frames:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:cover:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:cover:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video verify
```

沿用 `remotion.config.ts` 中的软件 `swangle`、PNG 帧和单并发配置。最终每版应为 H.264/yuv420p、1920×1080、30 FPS、2250 帧、75 秒，带 AAC/48 kHz 音轨。两版共 4500 帧完整解码与闪帧筛查后，仍需审看修改前后关键帧、双端布局和滚动、字幕旁白对齐，并分别完整回看；自动媒体检查不能代替这些视觉验收。

`out/verification.json` 登记本轮实际文件摘要、命令、帧检查、关键帧及完整回看结果。这里的定向检查不代表全仓或全平台全面验收；全面测试仍需先通过本轮环境预检。不得将旧版成功报告绑定到新素材。

最终验收记录为 `passed` 后打包：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video delivery
```

交付包含新版中英文 MP4、封面、SRT/VTT、完整桌面原片、独立设备录像、三阶段截图、阶段源码和 bundle、独立 JPEG 资源、剪辑与素材清单、验收记录及复现说明。`out/delivery-*` 使用独占目录，`SHA256SUMS` 覆盖包内文件；复现需要对应提交的完整仓库及 Node/pnpm 依赖。保留旧成片、旧原片和旧交付包，失败导出版与准备缓存不进入新版交付。

视频只宣称 ReactLynx + Rspeedy + Tailwind CSS 4 的已验证集成能力，不宣称支持全部 Tailwind utility。中文 CTA 为 `/zh-cn/docs/quick-start/frameworks/lynx`，英文为 `/docs/quick-start/frameworks/lynx`。
