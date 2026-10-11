# `@weapp-tailwindcss/lynx` 宣传视频

60 秒 Remotion 技术宣传片，提供中文和英文两个版本。画面中的产品界面来自 `examples/react-lynx-promo` 在 iOS 与 Android Lynx host 中的真实录制，两种语言共用双端录屏、兼容性截图和环境音。

## 生成素材

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video fonts
pnpm --filter @weapp-tailwindcss/lynx-promo-video assets
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video voice:en
```

也可以用 `voice` 一次生成两种语言的旁白。TTS 使用 `edge-tts`：中文为 `zh-CN-XiaoxiaoNeural`，英文为 `en-US-AriaNeural`，语速均为 `+8%`。旁白生成需要网络；生成后的 Remotion Studio、渲染和媒体验证只读取本地静态素材。

`fonts` 从两种语言的源码和字幕收集 glyph，生成本地 Noto Sans SC 子集，并复制 JetBrains Mono WOFF2；字体与两份 OFL 许可证保存在 `src/assets/fonts/`。`assets` 同时生成中文/英文 SRT、VTT、文档二维码和环境音。

## 预览与渲染

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video studio
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:frames:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:frames:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:cover:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:cover:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:zh
pnpm --filter @weapp-tailwindcss/lynx-promo-video render:en
pnpm --filter @weapp-tailwindcss/lynx-promo-video verify
```

Remotion Composition 为 `LynxPromoZh`、`LynxPromoEn`、`LynxPromoCoverZh` 和 `LynxPromoCoverEn`。旧的 `LynxPromo` 与 `LynxPromoCover` 保留为中文别名。

输出文件位于 `out/`：

```text
lynx-promo-zh-1080p.mp4
lynx-promo-en-1080p.mp4
lynx-promo-cover-1920x1080.png
lynx-promo-cover-en-1920x1080.png
```

聚合字幕位于工程根目录：`lynx-promo-zh.srt`、`lynx-promo-zh.vtt`、`lynx-promo-en.srt` 和 `lynx-promo-en.vtt`。旁白分语言保存在 `public/audio/narration/zh/` 与 `public/audio/narration/en/`。

`capture` 会在 `os.tmpdir()` 复制现有原生 fixture host，向临时 host 注入宣传 Demo bundle，并把处理后的 30 FPS H.264 录屏写入 `public/captures/`。兼容性报告模式仍使用原来的默认 bundle、报告等待和基线比较流程。

Android host 需要 Java 17 和 Gradle 8。若它们不在 PATH，可通过 `LYNX_JAVA_HOME` 与 `LYNX_GRADLE` 传入跨平台绝对路径；iOS 的 XcodeGen、CocoaPods 也可通过现有环境变量配置。

本次素材验收环境：iOS Simulator 为 iPhone 17 Pro / iOS 26.5，Android Emulator 为 `sdk_gphone_arm64` / Android 11 API 30；两端应用内 Lynx Engine 均为 4.0.1。处理后的录屏统一为 720 像素宽、30 FPS、H.264、无音频，单文件小于 10 MB。

## 内容边界

视频只宣称 ReactLynx + Rspeedy + Tailwind CSS 4 的已验证集成能力。兼容性数量从 `examples/react-lynx/src/compatibility/baseline.json` 生成，不宣称 Lynx 支持全部 Tailwind CSS utility。中文 CTA 使用 `/zh-cn/docs/quick-start/frameworks/lynx`，英文 CTA 使用 `/docs/quick-start/frameworks/lynx`。

字体由 `@fontsource-variable/noto-sans-sc` 与 `@fontsource-variable/jetbrains-mono` 提供，均使用 SIL Open Font License。
