---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 89a1c7ddf5130baa94e01734ffb7888f2c492d14
regressions:
  - apps/lynx-promo-video/src/capture-pipeline.test.ts
  - e2e/lynx-native-artifacts.test.ts
  - e2e/lynx-promo.test.ts
---

# Lynx 宣传录制的输出目录归属与素材绑定

## 症状

原宣传录制入口在调用原生 runner 前创建 `.capture/<platform>`，再把该现成目录传入 `--output`。runner 要求本轮目录不存在，并以不带 `recursive` 的 `mkdir` 独占创建；两个入口同时声称拥有目录创建权，触发 `EEXIST`，还没有进入有效原生录制。

原入口先删除固定目录、FFmpeg 用 `-y` 覆盖公开素材，重试会丢失上一轮原片。只保留 `ios.mp4`、`android.mp4` 和封面，也无法核实视频对应哪次源码、哪份 bundle、哪个设备；旧截图和旧片段可能混入新成片。2026-10-18 已完成完整桌面实录、阶段归档和双端素材采集；双语 75 秒成片正在渲染，最终媒体检查与完整回看尚待完成，因此本记录保持 `partial`。

## 根因与纠正

目录冲突来自调用方与被调用方的资源所有权不一致，不是 Lynx 编码或 Tailwind CSS 生成失败。修复保留 runner 的独占契约：录制入口用 `mkdtemp` 创建每轮父目录，仅计算 `raw/` 路径；原生 runner 创建 `raw/`。失败与重试各自保留独立目录，不删除旧轮次，也不把 runner 的独占创建改为宽松的递归创建。

归一化视频先写本轮新目录，FFmpeg 使用 `-n`；更新公开视频、封面和清单前，把已有内容复制到独立的 `previous-*` 归档。这个变化防止旧素材在准备新素材时直接消失，不等同于完成了本轮设备验收。

素材校验从“文件存在”扩展到可核对的来源清单：

- 对真实 `src/` 文件集和配置记录逐文件 SHA256 与总摘要；新增、删除或修改文件都使旧清单失效。
- 对原生 host 实际装载的 bundle、设备、原始视频和归一化视频建立绑定，清单路径相对其所在目录解析。
- 开发事件保留阶段源码目录、实际 bundle 和摘要。必须有 `spacing`、`color` 两次不同修改；最终 `color` 的源码与双端 bundle 必须一致。
- 兼容性截图由环境变量或清单显式指定来源；数量继续读取已提交的兼容性基线，不用宣传录屏推导支持范围。
- 开发原片与归一化片分别记录操作区间；剪辑必须绑定事件、按顺序取材、长度匹配场景，不能用重复或越界片段填满时长。

这些校验能拒绝缺失、陈旧或字节不匹配的素材。它们不能单凭摘要判断视频画面是否确实呈现操作，仍需核对真实编辑、构建、reload 和结果画面。

## 本轮录制与字节对应关系

完整开发原片保存在视频工程 `.capture/development-master-el114qz2/development-raw.mov`。录制器按 300 秒设置自动结束并封装；`ffprobe` 实测 H.264、3840×2160、可变帧率、300.08 秒。原片保留准备和等待，选段仅裁去这些时间，没有合成编辑、替换成功日志或加速播放。

同轮 `edit-decision-list.json` 对应以下真实选段：

| 事件 | 原片区间（秒） | 归一化区间（秒） | 帧数 |
| --- | --- | --- | --- |
| `config` | 10–18 | 0–8 | 240 |
| `spacing` | 77–86、92–95、112–115 | 8–17、17–20、20–23 | 450 |
| `color` | 180–189、197–200、214–217 | 23–32、32–35、35–38 | 450 |

归一化 `public/captures/development.mp4` 为 H.264、1920×1080、30 FPS、38 秒、1140 帧。时间校验对每段计算 `Math.round((endSeconds - startSeconds) / playbackRate * fps)` 后求和，要求配置场景严格为 240 帧、两次修改场景严格为 900 帧；一帧缺口也会失败。

三阶段实际源码与 bundle 位于同轮 `stages/`。摘要前 12 位如下，完整逐文件记录见各阶段 `evidence.json` 和公开素材清单：

| 阶段 | 源码 SHA256 前缀 | bundle SHA256 前缀 |
| --- | --- | --- |
| 起始配置 | `080de13ce861` | `a1890dbf09f9` |
| 间距与圆角 | `1af3aa439b37` | `f962f3be7bad` |
| 背景色与最终态 | `472d91fde26c` | `e8fed542c426` |

最终源码 SHA256 为 `472d91fde26c74e925e1c31fc2ba6da48e4f994e0099fa9ef7ad8f36eb639f7b`，最终 bundle SHA256 为 `e8fed542c426a6ea7efaf75e7c56195957e33532928ae8aba590214faf81aea3`。iPhone 17 Pro / iOS 26.5 与 Pixel 9 / Android 16 / API 36 的 host 均使用 Lynx Engine 4.0.1，装载的是这份最终 bundle。

iOS fixture 驱动真实 `LynxScrollView` / `UIScrollView` 的内容偏移，并在 `capture-scroll.json` 记录 `0 → 202 → 0` 像素、时间点和 bundle 摘要；Android 使用 `adb input swipe`。原生录制请求延长为 18 秒，但可变帧率原片归一化后仍须测量实际长度，不能用请求秒数放行。当前场景从第 70 帧播放 12 秒，每端归一化视频至少需要 `70 / 30 + 12` 秒；不足时重新采集并核验。

兼容性统计和当前设备截图分别标注来源：118 个用例及 45 / 72 / 1 的结论来自 2026-10-06 已提交基线，其环境为 iOS 26.5 与 Android 11 / API 30；`.capture/compatibility-20261018-android-sdk/screen.png` 为 2026-10-18 Pixel 9 / Android 16 的 `capture-only` 截图，不代表 Android 16 已重新验证全部 118 项。

## 验证

持久回归 `apps/lynx-promo-video/src/capture-pipeline.test.ts` 覆盖：调用方不预建 runner 输出目录、连续两轮保留原片、发布前归档、源码/配置内容与文件集变化、POSIX/Windows 路径、显式截图、无效时间区间、原片范围、素材/旁白时长，以及阶段源码或 bundle 被替换、两次修改相同、双端最终 bundle 不一致时拒绝输入。

已有 `e2e/lynx-native-artifacts.test.ts` 继续约束原生证据目录的独占归属与失败附件。新增 `e2e/lynx-promo.test.ts` 重新构建宣传示例，保存完整 encoder CSS 基线，并解码真实 bundle 检查最终颜色、四角圆角及四边内边距。Static 回归只证明样式生成与编码，不证明原生视觉结果。

本轮主任务已记录的视频工程定向 Vitest 45 项、宣传 Demo Vitest 2 项及宣传 static / 原生参数定向回归 37 项通过。宣传 Demo 的类型检查和 production 构建通过；仅对 `e2e/lynx-promo.test.ts` 执行 `-u` 更新基线，再以 `--update=none` 重验，3 项通过。早期示例拆分和 static 回归在独立工作树形成 `6778c62783b9c27b248bb5f42c0218f046797bb0` 与 `3e8c8c6c174136524e7ef905daa14483ede1b0c1`，后续已集成录制、媒体与布局回归；文首排查基线不包含这些修改。

集成后复现入口：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video test --update=none
pnpm --filter @weapp-tailwindcss/lynx-promo-video typecheck
pnpm --filter @weapp-tailwindcss/example-react-lynx-promo test --update=none
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-promo.test.ts e2e/lynx-native-options.test.ts --update=none
pnpm --filter @weapp-tailwindcss/lynx-promo-video verify
```

正常测试设置 `CI=1`。以上为本地定向验证，不代表已完成全端环境验收。`verify` 需要全部新素材存在，不以旧视频、旧报告或占位时间点代替。操作、归档和交付清单见[视频工程说明](../../../apps/lynx-promo-video/README.md)。

**最终验收待填写：双语成片、封面和字幕的实际输出、完整媒体校验、修改前后关键帧审看及中英文完整回看结论。当前渲染进行中，尚不宣称成片交付验收完成。**

## 适用边界

本问题涉及宣传视频编排和录制证据，不改变 `@weapp-tailwindcss/lynx` 公开 API，也不放宽原生 runner 的目录独占契约。开发演示采用真实 build + reload，不宣称 HMR。

本轮设备、源码和装载 bundle 已写入素材清单。历史 Android 11 兼容性基线不能作为 Pixel 9 / Android 16 的全量重验结果，当前设备画面也不能扩展历史支持结论。源码、设备或剪辑改变后应重新核验绑定。没有最终媒体检查与完整回看时，不能把单测或解码结果写成双端宣传成片验收通过。

## 规则评估

不新增 AGENTS。已有独立工作树、输出归属、保留原始证据、源码对应关系与静态基线规则足够；本次通过具体管线回归和交付文档落实。未来更换录制器、FFmpeg 处理方式或清单结构时，重跑目录归属、阶段字节绑定和双时间轴回归，并重新检查真实素材。
