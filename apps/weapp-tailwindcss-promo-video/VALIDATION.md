# 中英文传播片交付与验证记录

验证日期：2026-10-02。工程位于独立分支 `codex/brand-promo-video`，在首版基础上完成双语重剪；原有 Lynx 宣传片保持独立。

## 成片实测

| 版本 | 尺寸 / 视频时长 / 帧数 | 综合响度 | 真峰值 | 字幕段数 | MP4 字节数 |
| --- | --- | --- | --- | --- | --- |
| 中文横版 | 1920×1080 / 60 秒 / 1800 帧 | −16.07 LUFS | −1.29 dBTP | 18 | 5,099,881 |
| 中文竖版 | 1080×1920 / 30 秒 / 900 帧 | −16.09 LUFS | −1.95 dBTP | 11 | 2,935,335 |
| 英文横版 | 1920×1080 / 60 秒 / 1800 帧 | −16.05 LUFS | −1.41 dBTP | 22 | 5,231,406 |
| 英文竖版 | 1080×1920 / 30 秒 / 900 帧 | −15.96 LUFS | −1.63 dBTP | 11 | 3,014,101 |

四支视频均为 H.264、30 FPS、yuv420p、BT.709、AAC 48 kHz 立体声及 faststart。包含 AAC 尾部填充的容器时长分别为 60.053333 秒和 30.058667 秒。完整解码无错误，自动检测未发现黑场；四张封面尺寸、八份 SRT/VTT 与画面字幕的数据一致性全部通过。机器报告为 `out/verification-bilingual.json`。

## 实际执行的命令

以下命令在仓库根目录执行。本轮 worktree 复用已安装依赖，因此使用进程级环境变量关闭 pnpm 12 的运行前自动重装；没有修改仓库的依赖校验配置。

```bash
rtk proxy env CI=1 PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @weapp-tailwindcss/promo-video verify
rtk proxy env CI=1 PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @weapp-tailwindcss/promo-video verify --locale en --format landscape
rtk proxy env PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm exec eslint apps/weapp-tailwindcss-promo-video/src apps/weapp-tailwindcss-promo-video/scripts apps/weapp-tailwindcss-promo-video/package.json apps/weapp-tailwindcss-promo-video/tsconfig.json apps/weapp-tailwindcss-promo-video/vitest.config.ts --ext .ts,.tsx,.json,.css --rule 'format/prettier: off'
rtk proxy git diff --check
rtk proxy env PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm agents:check
```

媒体准备按 `fonts`、`voice`、`music`、`audio` 的顺序完成，随后执行 `render:frames`、`render`。渲染复用本机已有兼容 Chromium，进程级设置 `REMOTION_BROWSER_EXECUTABLE`；渲染结束后由脚本释放其创建的后台浏览器。完整复现及语言筛选命令见 `README.md`。

## 自动检查与独立复核

- 定向测试：4 个文件、18 项测试通过，覆盖四组合时间轴、语言文案、Composition 标识、词边界字幕、英文断行、动效关键词、声音缓存完整性及语言/画幅选择。
- TypeScript、定向 ESLint、`git diff --check`：通过。ESLint 显式关闭 `format/prettier`，遵守仓库禁止 Prettier 的规则。
- 仓库规则检查：54 份规则、109 份文档、528 个命令条目，0 个错误。
- 实际旁白共 28 段，全部在镜头结束前完成；manifest 与实际词边界文件一致。四版共 62 条字幕无重叠，最多两行，镜头切换后无字幕残留。
- 英文标点、缩写、连字符、数字读法通过回归；代码变化与接入步骤使用对应语言实际语音关键词驱动。媒体校验同时检查字幕、旁白和动效时间是否过期。
- 对英文竖版单独重新混音，使用 SHA-256 比较中文声音、英文横版声音、中文字幕以及其余三组合的生成数据：内容保持一致，语言与画幅缓存隔离通过实际检查。
- 四支最终 MP4 的片尾抽帧均通过本机 Vision 解码为 `https://tw.weapp.dev`。

## 视觉检查与证据边界

先检查四个版本的开场、代码变化、平台展开、最密集接入代码、转场边界及 CTA，再渲染全部视频。检查中调整了竖版平台标签字号、完整命令的视觉换行、英文界面标点和 Tailwind CSS 4 的间距。

从最终 MP4 再次抽取各段画面，保存为 `out/{zh,en}/*-storyboard.jpg`；竖版另以 360×640 展示尺寸检查，关键内容避开顶部 180 px、底部 300 px、右侧 180 px。原始抽帧保存在各语言目录的 `encoded-frames/`。源码、真实旁白数据与重点画面经过独立只读复核。最终检查发现英文双行字幕有孤立尾字；新增回归先复现失败，再以均衡断行修正。英文横版随后重新渲染、完整验证，并检查 20 秒处双行字幕及片尾二维码；其余三版不受影响。

已完成的是关键帧视觉检查、编码后抽帧、完整解码、词边界对齐和响度/峰值测量。本记录不代表整片逐秒人工观看、主观试听或真实手机播放；专业名词的主观发音与音乐听感尚需在目标设备上试听。FLOW 界面和设备属于设计示意，不是产品跨端运行的验收证据。

## 交付与范围

`out/weapp-tailwindcss-bilingual-media-kit.zip` 包含四支 MP4、四张 PNG 封面、八份 SRT/VTT、制作说明、本验证记录、媒体报告及文件 SHA-256 清单。MP4 已烧录字幕；平台额外导入 SRT/VTT 时避免重复显示。首版成片和首版压缩包仍保留在 `out/` 根目录供对比。

可编辑源码、字体和许可证在本工程，声音素材位于 `public/audio/{zh,en}/`。输出和声音缓存不纳入 Git；离线重渲需保留当前 worktree 或备份声音素材，也可按制作说明联网重新合成。

本轮通过的检查如上，无未解决的自动检查失败或渲染阻塞。产品全端 E2E 不属于本私有媒体工程的验证范围，未执行；没有等待远端 CI，也没有公开发布。局部 AGENTS 更新为四版交付及竖版安全区职责，未新增或放宽仓库通用规则。
