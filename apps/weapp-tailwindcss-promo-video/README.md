# weapp-tailwindcss 中英文传播片

面向前端开发者，以「Tailwind，不止 Web / Tailwind. Beyond the web.」开场。通过代码变化、目标端、开发生态和接入步骤介绍产品。中文与英文各有 60 秒横版、30 秒竖版，共四支视频；每套都有对应语言的旁白、画面与字幕。

## 交付

| 目录 | 内容 |
| --- | --- |
| `out/zh/` | 中文横版 1920×1080、竖版 1080×1920，及封面、SRT/VTT |
| `out/en/` | 英文横版 1920×1080、竖版 1080×1920，及封面、SRT/VTT |
| `subtitles/zh/`、`subtitles/en/` | 纳入版本管理的对应语言字幕 |
| `out/verification-bilingual.json` | 四个版本的媒体实测报告 |
| `out/weapp-tailwindcss-bilingual-media-kit.zip` | 四支成片、封面、字幕和制作记录 |

每个语言目录中的成片名为 `weapp-tailwindcss-landscape.mp4` 和 `weapp-tailwindcss-portrait.mp4`，封面追加 `-cover.png`。首版中文成片仍保留在 `out/` 根目录，便于对比；根目录旧 SRT/VTT 也属于首版。

视频为 H.264、30 FPS、yuv420p、BT.709、AAC 48 kHz 立体声及 faststart；横版 1800 帧，竖版 900 帧。声音目标 −16±1 LUFS，真峰值不高于 −1 dBTP。MP4 已烧录字幕，平台额外导入 SRT/VTT 时避免重复显示。

## 环境与制作

使用仓库指定的 Node.js / pnpm；另需 PATH 中的 `ffmpeg`、`ffprobe` 和 `uvx`。新 checkout 先在仓库根目录安装依赖，然后执行：

```bash
pnpm --filter @weapp-tailwindcss/promo-video prepare:media
pnpm --filter @weapp-tailwindcss/promo-video render:frames
pnpm --filter @weapp-tailwindcss/promo-video render
pnpm --filter @weapp-tailwindcss/promo-video verify
```

首次准备字体和语音需要联网，渲染只读取本地素材。语音使用 `edge-tts==7.2.8`：中文 `zh-CN-XiaoxiaoNeural`（+8%），英文 `en-US-JennyNeural`（+4%）。词边界取自同一音频流；文案超时会报错，须精简内容，不自动加速或截断。

所有声音、渲染和校验脚本默认处理四个版本，也可指定语言和画幅：

```bash
pnpm --filter @weapp-tailwindcss/promo-video prepare:media --locale en
pnpm --filter @weapp-tailwindcss/promo-video voice --locale zh --format portrait
pnpm --filter @weapp-tailwindcss/promo-video audio --locale en --format portrait
pnpm --filter @weapp-tailwindcss/promo-video render:frames --locale en
pnpm --filter @weapp-tailwindcss/promo-video render:landscape --locale zh
pnpm --filter @weapp-tailwindcss/promo-video render:portrait --locale en
pnpm --filter @weapp-tailwindcss/promo-video render:covers
pnpm --filter @weapp-tailwindcss/promo-video verify --locale en
pnpm --filter @weapp-tailwindcss/promo-video studio
```

`--locale` 支持 `zh`、`en`、`all`；`--format` 支持 `landscape`、`portrait`、`all`。局部混音会保留其他语言的字幕与动效时间，局部验证也会保留其他版本的报告。

Remotion 管理其后台 Headless Shell。可通过 `REMOTION_BROWSER_EXECUTABLE` 指定已有兼容 Chromium 的绝对路径；`REMOTION_CONCURRENCY` 默认 4。每次渲染复用一个后台浏览器，正常或异常结束均关闭。本次 worktree 复用已安装依赖；使用同样方式时，进程级设置 `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` 可防止 pnpm 12 自动重装。常规完整安装无需此设置。

## 编辑入口

- `src/config.ts`：两套时间轴、画幅、语言、声音与字幕安全区。
- `src/content/`：双语画面文案、旁白、字幕短语和动效关键词。英文独立编写；框架和代码标识保留官方名称。
- `src/scenes/`、`src/components/`：按帧驱动的镜头、光带和界面设计示意；代码变化与接入步骤使用对应语言的实际语音关键词时间切换。
- `scripts/audio/`：字幕映射、两行断行、缓存校验、120 BPM 原创电子音乐合成。`audio` 脚本完成旁白压低与两遍响度归一。
- `src/generated/`：语音对齐后的字幕和镜头内部切换时间。更新旁白后先重新执行 `voice`、`audio`，再渲染；增加文字后执行 `fonts`，更改时长后执行 `music`。

中文 composition 仍为 `WeappPromoLandscape`、`WeappPromoPortrait`；英文追加 `En`。四个封面在对应 composition ID 后追加 `Cover`。

## 内容与素材依据

平台、框架、CLI 和运行时工具以仓库中英文 README 为依据。接入代码明确展示 Vite/Web；CLI 的小程序目标为 CSS-only。跨端范围包括 Web/H5、小程序、App WebView、uni-app x、React Native/Expo、Lynx，各目标的样式能力以对应运行时为准。

FLOW 界面及按钮为自制设计示意，不作为实际设备验收证据。Logo 来自仓库正式素材，框架标识来自官网素材。Noto Sans SC 与 JetBrains Mono 的 OFL 许可证保留在字体目录。音乐为确定性合成脚本制作，没有使用外部商业录音。

## 验证与保存

```bash
pnpm --filter @weapp-tailwindcss/promo-video test
pnpm --filter @weapp-tailwindcss/promo-video typecheck
pnpm --filter @weapp-tailwindcss/promo-video verify
pnpm agents:check
```

定向检查包含四组合文案、时间轴、真实词边界、英文断行、镜头关键词、缓存完整性和语言选择；媒体验证检查旁白、字幕同步、尺寸、帧数、编码、色彩空间、完整解码、黑帧、响度和 faststart。实际结果与人工检查范围见 `VALIDATION.md`。本工程不需要产品全端 E2E。

`out/`、`.render/`、`public/audio/` 不纳入 Git。离线重渲必须保留 `public/audio/{zh,en}/`，或重新联网生成声音；语音服务版本变化可能影响重新合成的音色和时长。公开发布前需在目标设备上完整观看与试听。
