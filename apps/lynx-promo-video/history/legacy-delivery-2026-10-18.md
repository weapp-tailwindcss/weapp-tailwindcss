> 本页保留 2026-10-18 旧版交付记录。旧素材、剪辑区间与摘要不适用于当前头像重制版；当前复现入口见[工程说明](../README.md)。

# `@weapp-tailwindcss/lynx` 宣传视频

75 秒、1920×1080、30 FPS 的 Remotion 技术宣传片，提供中文和英文两个版本。核心画面展示真实的编辑器、构建终端与 Lynx 原生页面；两种语言共用本轮开发实录、双端设备录屏和兼容性截图。

**本轮交付状态（2026-10-18）：中英文成片、封面、SRT/VTT 与完整开发原片已完成。** 最终媒体校验、两版共 4500 帧完整解码、修改前后关键帧审看及两版完整播放均已通过。原片、实际剪辑区间和设备信息见下文。

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

工具链和设备操作边界遵循[本地多端手册](../../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。本轮设备为 iPhone 17 Pro 模拟器（iOS 26.5）与 Pixel 9 模拟器（Android 16、API 36），两端 host 均使用 Lynx Engine 4.0.1，ReactLynx 编码目标为 3.9。实际设备 ID 与装载 bundle 记录在本轮 `device.json`、构建记录和素材清单中。

Android 链路需要 Java 17、Gradle 8.9 或兼容的更新 8.x，以及 fixture 声明的 Android SDK platform 和 Build Tools。路径可通过 `LYNX_JAVA_HOME`、`LYNX_GRADLE`、`ANDROID_HOME` / `ANDROID_SDK_ROOT` 配置；两个 SDK 环境变量同时存在时应指向同一 SDK。iOS 需要 PATH 中的 XcodeGen、Xcode 命令行工具和 CocoaPods；可通过 `LYNX_POD` 选择 CocoaPods。使用 `LYNX_IOS_DEVICE_ID`、`LYNX_ANDROID_DEVICE_ID` 明确绑定本轮设备，不把本机绝对路径或设备 ID 提交到配置。

恢复最终源码后，在仓库根目录执行：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video capture:ios
pnpm --filter @weapp-tailwindcss/lynx-promo-video capture:android
```

`capture` 可串行采集两端。入口重新构建宣传 Demo，将 bundle 注入临时原生 fixture host。每轮在工程 `.capture/` 下分配独占目录；父目录由入口创建，`raw/` 由原生 runner 独占创建，调用方不得预建它。终端输出本轮 `rawDir` 与 `manifestFile`。失败时保留该轮目录与失败证据，重试分配新目录，禁止删除旧轮次来回避 `EEXIST`。

本轮运行目录包含原始设备录像、设备记录和实际装载的 `main.lynx.bundle`；归一化录像为 720 像素宽、30 FPS、H.264、无音频。入口发布到 `public/captures/ios.mp4`、`android.mp4` 及对应封面前，将已有文件和清单复制至 `.capture/previous-*/`，保留原素材。

本轮原生采集请求时长为 18 秒。设备原片可能使用可变帧率，FFmpeg 转为 30 FPS 后的实际时长须重新测量，不能把请求时长当作素材时长。`NativeScene` 从第 70 帧开始使用 12 秒素材，归一化后每端至少需要 `70 / 30 + 12` 秒；不足时重新采集并检查归一化结果。

iOS 滚动由 fixture 驱动真实 `LynxScrollView` / `UIScrollView`，本轮 `capture-scroll.json` 记录偏移 `0 → 202 → 0` 像素及最终 bundle 摘要；Android 使用 `adb input swipe` 手势。录制方法与原生结果一并保留，不把桌面工具的拖拽调用等同于已成功触发设备滚动。

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

逐段按 `Math.round((endSeconds - startSeconds) / playbackRate * 30)` 计算播放帧数后求和：`config` 必须严格等于 240 帧，`classname` 必须严格等于 900 帧，没有一帧容差。按顺序选取片段，不能重复使用或逆序播放同一开发区间。所有区间应落在有效素材与对应事件范围内。`assets` 从清单生成 `src/generated/development.json`，不要手改该生成文件来掩盖素材缺失。

### 本轮实录记录

完整原片为 `.capture/development-master-el114qz2/development-raw.mov`：H.264、3840×2160、可变帧率、实测 300.08 秒，由录制器在 300 秒设置下自动结束并封装。原片完整保留；`edit-decision-list.json` 记录以下原速选段，裁去准备和等待时间。本轮没有加速片段。

| 阶段 | 原片区间（秒） | 归一化区间（秒） | 播放帧数 |
| --- | --- | --- | --- |
| 配置 | 10–18 | 0–8 | 240 |
| 间距与圆角 | 77–86、92–95、112–115 | 8–17、17–20、20–23 | 270 + 90 + 90 = 450 |
| 背景色 | 180–189、197–200、214–217 | 23–32、32–35、35–38 | 270 + 90 + 90 = 450 |

归一化开发视频为 `public/captures/development.mp4`：H.264、1920×1080、30 FPS、38 秒、1140 帧。三阶段归档位于同轮原片目录的 `stages/initial/`、`stages/spacing/`、`stages/color/`，各自含源码、实际 bundle 与 `evidence.json`。以下摘要取前 12 位便于核对，完整 SHA256 在清单与归档内：

| 阶段 | 源码 SHA256 前缀 | bundle SHA256 前缀 |
| --- | --- | --- |
| `initial` / `config` | `080de13ce861` | `a1890dbf09f9` |
| `spacing` | `1af3aa439b37` | `f962f3be7bad` |
| `color` / 最终双端 | `472d91fde26c` | `e8fed542c426` |

最终源码 SHA256 为 `472d91fde26c74e925e1c31fc2ba6da48e4f994e0099fa9ef7ad8f36eb639f7b`；两端装载的最终 bundle SHA256 均为 `e8fed542c426a6ea7efaf75e7c56195957e33532928ae8aba590214faf81aea3`。两次修改、独立设备原片及当前兼容性截图的路径继续以 `public/captures/manifest.json` 为准。

## 生成旁白、字幕与其他素材

先准备实录清单、开发视频、两端设备素材与显式兼容性截图，再执行素材生成。兼容性截图通过 `LYNX_PROMO_COMPATIBILITY_SCREENSHOT` 明确指定，或登记在 `manifest.compatibility`；不要从某次旧报告目录静默选取。统计仍读取 `examples/react-lynx/src/compatibility/baseline.json`。

本轮画面中的 118 个用例统计来自 **2026-10-06 已提交双端基线**：45 项双端支持、72 项双端不支持、1 项平台差异，基线环境为 iOS 26.5 与 Android 11 / API 30。展示截图来自 2026-10-18 Pixel 9 / Android 16 的 `capture-only` 运行，显式来源为 `.capture/compatibility-20261018-android-sdk/screen.png`；它展示当前运行画面，不代表已在 Android 16 重新验证全部 118 个用例。

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video assets
pnpm --filter @weapp-tailwindcss/lynx-promo-video fonts
```

`voice` 可一次生成双语旁白。开发段使用逐句计划与静默间隔，对齐本轮剪辑：中文场景内起点为 0.1、3.2、9.1、15.1 秒，英文为 0.1、2.2、9.1、15.1、23.1 秒。每句原始 MP3/VTT 和 `plan.json` 保留在 `03-classname-parts/`；字幕按实际语音结束，不铺满静默区间。仅重生成开发段可执行 `pnpm exec tsx scripts/generate-narration.ts all --scene classname`。

TTS 使用 `edge-tts`：中文 `zh-CN-XiaoxiaoNeural`、英文 `en-US-AriaNeural`，语速均为 `+8%`，生成需要网络。先生成逐句旁白时间，再由 `assets` 汇总 SRT/VTT 与字幕数据；字体子集依据最终文字生成。预览、渲染和媒体验证读取本地素材。

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

正常测试设置 `CI=1`。Static 基线更新仅限宣传 Demo，更新与不更新验证命令见[示例说明](../../../examples/react-lynx-promo/README.md)。这里的定向测试不代表完成全端环境验收；全面测试仍需本轮预检全部通过。

本轮视频工程定向 Vitest 63 项、宣传 Demo Vitest 2 项通过；录制滚动、host 上下文、Android 编码器就绪与参数定向回归 57 项通过。宣传 static 仅对 `e2e/lynx-promo.test.ts` 执行 `-u` 更新，再以 `--update=none` 重验，3 项通过；Demo 类型检查和 production 构建通过。最终 `verify` 包含 63 项测试、视频工程类型检查和全部媒体校验，结果通过；阶段摘要及原生画面按本轮清单保留。

默认渲染配置位于 `remotion.config.ts`：软件 `swangle`、PNG 帧、单并发。桌面 Chrome 默认 GPU 在本轮曾产生孤立的整屏网格帧；保留失败版用于排查，切换后须对最终文件完整解码全部 2250 帧。`verify` 检测三帧邻域中的孤立突变，保存 `out/lynx-promo-{zh,en}-frame-qa.json`，发现候选立即失败并要求逐帧审查。该检查是闪帧筛查，不能代替布局与内容审看。

Composition 为 `LynxPromoZh`、`LynxPromoEn`、`LynxPromoCoverZh`、`LynxPromoCoverEn`；旧 `LynxPromo` 和 `LynxPromoCover` 保留为中文别名。输出位于 `out/`：

```text
lynx-promo-zh-1080p.mp4
lynx-promo-en-1080p.mp4
lynx-promo-cover-1920x1080.png
lynx-promo-cover-en-1920x1080.png
```

媒体验收检查来源与阶段摘要、素材存在、有效剪辑区间、双语逐句字幕、旁白不越界、双端素材长度及最终 H.264/yuv420p、1920×1080、30 FPS、75 秒和 AAC/48 kHz 音轨。自动检查通过后仍需审看两次修改前后关键帧，核对代码字号、终端结果、原生布局与滚动，并完整回看中英文成片。

本轮两版 MP4 均为 H.264/yuv420p、1920×1080、30 FPS、2250 帧，视频轨严格 75 秒；AAC 立体声 48 kHz 的封装时长为 75.050667 秒，包含编码补齐。每版全帧扫描均为 0 个孤立闪帧候选，独立网格检查也为 0。两次编辑、保存、构建成功和原生结果的关键帧，以及双端布局、滚动、兼容性来源、封面与 CTA 已审看；中英文最终文件已分别完整播放至结束。

音频信号检查结果为中文 −16.8 LUFS / −2.8 dBFS true peak、英文 −18.1 LUFS / −3.0 dBFS true peak，无削波；逐句音频时间与字幕、操作起点已核对。`out/verification.json` 保存最终文件摘要、验证范围、全帧结果和完整播放时间。未执行全仓或全平台全面验收，也未在 Android 16 重跑历史 118 项兼容性用例；本轮没有失败、跳过或阻塞的定向验收项。

## 交付打包

最终验收记录的 `status` 为 `passed` 后执行：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video delivery
```

命令在 `out/delivery-*` 创建独占新目录，保留双语 MP4、封面、四份字幕、300.08 秒完整桌面原片、EDL、阶段源码与 bundle、双端原始证据、视频工程及复现说明。包内素材清单转换为可迁移相对路径，原清单另存；`SHA256SUMS` 覆盖所有交付文件。复现需要对应提交的完整仓库和 Node/pnpm 依赖，交付包不包含完整 monorepo 或 `node_modules`。失败 GPU 导出版、准备缓存与审看临时文件不进入交付包。

视频只宣称 ReactLynx + Rspeedy + Tailwind CSS 4 的已验证集成能力，不宣称 Lynx 支持全部 Tailwind utility。中文 CTA 为 `/zh-cn/docs/quick-start/frameworks/lynx`，英文为 `/docs/quick-start/frameworks/lynx`。
