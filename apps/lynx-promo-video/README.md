# `@weapp-tailwindcss/lynx` 宣传视频

75 秒、1920×1080、30 FPS 的 Remotion 技术宣传片，提供中文和英文两个版本。核心画面展示真实的编辑器、构建终端与 Lynx 原生页面；两种语言共用本轮开发实录、双端设备录屏和兼容性截图。

**本轮交付状态：实录仍在准备。** 以下说明定义复现与验收流程；最终原片位置、设备系统版本、操作时间点、成片与完整回看结果均待本轮录制完成后填写。仓库中的旧视频、旧设备说明和占位剪辑区间不能作为本轮完成证据。

## 分镜与开发操作

| 成片时间 | 画面 | 实录要求 |
| --- | --- | --- |
| 0–5 秒 | 品牌开场与最终效果 | 本轮最终原生页面 |
| 5–13 秒 | 真实 Rspeedy 配置 | 编辑器打开实际 `lynx.config.ts`，展示公开插件接入 |
| 13–43 秒 | 两次修改、构建与原生结果 | 连续编辑同一状态卡，每次保存后构建、重新加载并展示变化 |
| 43–49 秒 | 构建流程 | 对应真实 CSS 生成与 Lynx 编码流程 |
| 49–61 秒 | iOS、Android 运行与滚动 | 同一最终 bundle，保留独立双端录屏 |
| 61–70 秒 | 兼容性证据与支持边界 | 显式绑定截图来源，统计读取已提交基线 |
| 70–75 秒 | 文档与二维码 | 使用对应语言的文档入口 |

实际编辑入口为 `examples/react-lynx-promo/src/components/BuildStatus.tsx`。同一条 `className` 依次经过：

1. 起始态：`rounded-[8px] p-2 bg-[#171e20]`。
2. `spacing`：`rounded-[18px] p-4 bg-[#171e20]`。
3. `color`：`rounded-[18px] p-4 bg-[#10241b]`，即提交的最终态。

每次修改后在录制中的集成终端运行：

```bash
pnpm --filter @weapp-tailwindcss/example-react-lynx-promo build
```

保留保存动作、终端构建成功及原生 host 重新加载后的结果。这里采用 **build + reload**，不展示或宣称 HMR。`capture` 命令负责独立设备素材，不会自动操作 VS Code 或完成桌面开发录制；专用编辑器窗口、终端与模拟器需要在同一桌面录制中实际操作。等待可在后期剪去或加速；加速区间标注“构建等待已压缩 / Build waits condensed”。

状态卡上的 `Bundle ready` 是固定的示例内容。构建结果以终端日志和原生画面为准，不把它当作实时进度监控，也不展示未经测量的耗时、KB 或候选数量。

## 设备录制与独立输出

工具链和设备操作边界遵循[本地多端手册](../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。本轮目标设备为 iPhone 17 Pro 与已安装的 Pixel 9；实际 OS、设备 ID、Lynx 版本和录制结果以本轮 `device.json`、构建记录与素材清单为准，均待填写。

Android 链路需要 Java 17、Gradle 8.9 或兼容的更新 8.x，以及 fixture 声明的 Android SDK platform 和 Build Tools。路径可通过 `LYNX_JAVA_HOME`、`LYNX_GRADLE`、`ANDROID_HOME` / `ANDROID_SDK_ROOT` 配置；两个 SDK 环境变量同时存在时应指向同一 SDK。iOS 需要 PATH 中的 XcodeGen、Xcode 命令行工具和 CocoaPods；可通过 `LYNX_POD` 选择 CocoaPods。使用 `LYNX_IOS_DEVICE_ID`、`LYNX_ANDROID_DEVICE_ID` 明确绑定本轮设备，不把本机绝对路径或设备 ID 提交到配置。

恢复最终源码后，在仓库根目录执行：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video capture:ios
pnpm --filter @weapp-tailwindcss/lynx-promo-video capture:android
```

`capture` 可串行采集两端。入口重新构建宣传 Demo，将 bundle 注入临时原生 fixture host。每轮在工程 `.capture/` 下分配独占目录；父目录由入口创建，`raw/` 由原生 runner 独占创建，调用方不得预建它。终端输出本轮 `rawDir` 与 `manifestFile`。失败时保留该轮目录与失败证据，重试分配新目录，禁止删除旧轮次来回避 `EEXIST`。

本轮运行目录包含原始设备录像、设备记录和实际装载的 `main.lynx.bundle`；归一化录像为 720 像素宽、30 FPS、H.264、无音频。入口发布到 `public/captures/ios.mp4`、`android.mp4` 及对应封面前，将已有文件和清单复制至 `.capture/previous-*/`，保留原素材。

默认清单为 `public/captures/manifest.json`，也可用 `LYNX_PROMO_CAPTURE_MANIFEST` 指向本轮清单。清单记录源码逐文件 SHA256、总摘要、设备、runner 来源、raw/处理后视频、封面与 bundle 摘要；文件路径相对清单所在目录解析。该清单路径和对应归档必须一起保留，不能只交付公开 MP4。

## 开发原片、阶段归档与剪辑时间

保留一份完整桌面开发原片，并制作 `public/captures/development.mp4` 供 Remotion 使用。原片可以使用录制器的原始编码；处理后视频必须为 H.264、30 FPS。不要用合成打字、重复设备画面或重新演出的构建成功日志替代两次真实修改。

每个开发事件在 `manifest.development.events` 中登记唯一 `id`、操作区间、源码和 bundle 摘要，并归档该阶段的源码目录与实际构建 bundle。`config`、`spacing`、`color` 阶段分别保留；源码归档须包含 `src/`、`lynx.config.ts`、`package.json`，以及存在时的 `rspeedy.config.ts`。使用现有 `snapshotSources`、`digestFile`、`manifestRelativePath` 帮助函数生成摘要与路径，不能填写示例摘要代替实际字节。

`spacing` 与 `color` 必须对应不同源码和不同 bundle；`color` 的源码摘要必须等于最终工程摘要，其 bundle 摘要必须同时等于 iOS、Android 录制装载的 bundle。后续修改源码、配置或归档文件都会使素材校验失败，需要重新录制或重新绑定可证明对应关系的阶段素材。

清单区分两条时间轴，单位均为秒：

| 字段 | 含义 |
| --- | --- |
| `development.rawVideo` | 完整、未剪辑的桌面原片 |
| `development.video` | 供剪辑播放的归一化 `development.mp4` |
| 事件 `rawStartSeconds` / `rawEndSeconds` | 操作在原片中的起止时间 |
| 事件 `startSeconds` / `endSeconds` | 同一操作在归一化视频中的区间 |
| `clips[].startSeconds` / `endSeconds` | 从归一化视频选取的片段，不是成片时间 |
| `clips[].sceneId` / `eventId` | 片段对应的成片场景和已归档事件 |
| `clips[].playbackRate` | 片段播放速度，默认 1；加速须在画面说明 |

`config` 片段累计播放时长须为 8 秒，`classname` 为 30 秒，误差不超过一帧；按顺序选取片段，不能重复使用或逆序播放同一开发区间。所有区间应落在有效素材与对应事件范围内。`assets` 从清单生成 `src/generated/development.json`，不要手改该生成文件来掩盖素材缺失。

最终待补录的交付记录：完整原片与归一化视频位置；各事件的两条时间区间；三阶段源码及 bundle 归档位置/摘要；两端设备与系统信息；两次修改前后截图；双语成片路径、校验结果和完整回看结论。当前不以旧录像或占位区间宣称这些项目已完成。

## 生成旁白、字幕与其他素材

先准备实录清单、开发视频、两端设备素材与显式兼容性截图，再执行素材生成。兼容性截图通过 `LYNX_PROMO_COMPATIBILITY_SCREENSHOT` 明确指定，或登记在 `manifest.compatibility`；不要从某次旧报告目录静默选取。统计仍读取 `examples/react-lynx/src/compatibility/baseline.json`。

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video assets
pnpm --filter @weapp-tailwindcss/lynx-promo-video fonts
```

`voice` 可一次生成双语旁白。TTS 使用 `edge-tts`：中文 `zh-CN-XiaoxiaoNeural`、英文 `en-US-AriaNeural`，语速均为 `+8%`，生成需要网络。先生成逐句旁白时间，再由 `assets` 汇总 SRT/VTT 与字幕数据；字体子集依据最终文字生成。预览、渲染和媒体验证读取本地素材。

素材目录包括：

| 位置 | 内容 |
| --- | --- |
| `public/captures/manifest.json` | 本轮来源、阶段、设备和剪辑清单 |
| `public/captures/development.mp4` | 开发流程归一化实录 |
| `public/captures/ios.mp4`、`android.mp4` | 独立双端视频及对应封面 |
| `public/captures/compatibility-lab.png` | 已明确来源的兼容性截图 |
| `.capture/` 与清单引用的归档位置 | 完整原片、运行证据、阶段源码及 bundle、旧素材备份 |
| `public/audio/narration/zh/`、`en/` | 双语逐场景旁白和时间文件 |
| `src/generated/` | 来源统计、开发剪辑和逐句字幕数据 |
| 工程根目录 `lynx-promo-{zh,en}.{srt,vtt}` | 交付字幕 |

`assets` 还生成品牌素材、双语文档二维码和环境音。`fonts` 在 `src/assets/fonts/` 保存本地 Noto Sans SC 子集、JetBrains Mono WOFF2 与两份 OFL 许可证。

## 预览、渲染与验收

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video test --update=none
pnpm --filter @weapp-tailwindcss/lynx-promo-video typecheck
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-promo.test.ts --update=none
pnpm --filter @weapp-tailwindcss/lynx-promo-video studio
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:frames:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:frames:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:cover:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:cover:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video verify
```

正常测试设置 `CI=1`。Static 基线更新仅限宣传 Demo，更新与不更新验证命令见[示例说明](../../examples/react-lynx-promo/README.md)。这里的定向测试不代表完成全端环境验收；全面测试仍需本轮预检全部通过。

Composition 为 `LynxPromoZh`、`LynxPromoEn`、`LynxPromoCoverZh`、`LynxPromoCoverEn`；旧 `LynxPromo` 和 `LynxPromoCover` 保留为中文别名。输出位于 `out/`：

```text
lynx-promo-zh-1080p.mp4
lynx-promo-en-1080p.mp4
lynx-promo-cover-1920x1080.png
lynx-promo-cover-en-1920x1080.png
```

媒体验收检查来源与阶段摘要、素材存在、有效剪辑区间、双语逐句字幕、旁白不越界、双端素材长度及最终 H.264/yuv420p、1920×1080、30 FPS、75 秒和 AAC/48 kHz 音轨。自动检查通过后仍需审看两次修改前后关键帧，核对代码字号、终端结果、原生布局与滚动，并完整回看中英文成片。最终验收记录待本轮素材完成后填写。

视频只宣称 ReactLynx + Rspeedy + Tailwind CSS 4 的已验证集成能力，不宣称 Lynx 支持全部 Tailwind utility。中文 CTA 为 `/zh-cn/docs/quick-start/frameworks/lynx`，英文为 `/docs/quick-start/frameworks/lynx`。
