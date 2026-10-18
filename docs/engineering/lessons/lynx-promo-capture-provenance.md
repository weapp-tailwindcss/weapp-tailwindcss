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

原入口先删除固定目录、FFmpeg 用 `-y` 覆盖公开素材，重试会丢失上一轮原片。只保留 `ios.mp4`、`android.mp4` 和封面，也无法核实视频对应哪次源码、哪份 bundle、哪个设备；旧截图和旧片段可能混入新成片。完整桌面实录、阶段归档与双语 75 秒成片仍在准备，因此本记录保持 `partial`。

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

## 验证

持久回归 `apps/lynx-promo-video/src/capture-pipeline.test.ts` 覆盖：调用方不预建 runner 输出目录、连续两轮保留原片、发布前归档、源码/配置内容与文件集变化、POSIX/Windows 路径、显式截图、无效时间区间、原片范围、素材/旁白时长，以及阶段源码或 bundle 被替换、两次修改相同、双端最终 bundle 不一致时拒绝输入。

已有 `e2e/lynx-native-artifacts.test.ts` 继续约束原生证据目录的独占归属与失败附件。新增 `e2e/lynx-promo.test.ts` 重新构建宣传示例，保存完整 encoder CSS 基线，并解码真实 bundle 检查最终颜色、四角圆角及四边内边距。Static 回归只证明样式生成与编码，不证明原生视觉结果。

本轮已完成的宣传 Demo 定向验证：包内 Vitest 2 项、类型检查和 production 构建通过；仅对 `e2e/lynx-promo.test.ts` 执行 `-u` 生成基线，再以 `--update=none` 重验，3 项通过。定向 ESLint、规则检查与 `git diff --check` 通过。该验证针对包含未提交修改的独立工作树，随后形成 `6778c62783b9c27b248bb5f42c0218f046797bb0` 和 `3e8c8c6c174136524e7ef905daa14483ede1b0c1` 两个提交；原排查基线不包含这些修改。

集成后复现入口：

```bash
pnpm --filter @weapp-tailwindcss/lynx-promo-video test --update=none
pnpm --filter @weapp-tailwindcss/lynx-promo-video typecheck
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-promo.test.ts --update=none
pnpm --filter @weapp-tailwindcss/lynx-promo-video verify
```

正常测试设置 `CI=1`。本篇整理时仅审阅了录制管线的新实现与持久回归；管线集成的最终测试结果、两端新录屏、完整开发原片、阶段操作时间、双语成片及完整回看仍待本轮主任务补齐。`verify` 需要全部新素材存在，不以旧视频、旧报告或占位时间点代替。操作、归档和交付清单见[视频工程说明](../../../apps/lynx-promo-video/README.md)。

## 适用边界

本问题涉及宣传视频编排和录制证据，不改变 `@weapp-tailwindcss/lynx` 公开 API，也不放宽原生 runner 的目录独占契约。开发演示采用真实 build + reload，不宣称 HMR。

目标设备为本轮选定的 iPhone 17 Pro 与 Pixel 9，实际设备 ID、OS 和运行结果尚待写入本轮清单；旧素材的 Android 11 信息不作为这次 Pixel 9 的验证证据。源码、设备或剪辑改变后应重新核验绑定。没有原生截图与完整回看时，不能把单测或解码结果写成双端宣传成片验收通过。

## 规则评估

不新增 AGENTS。已有独立工作树、输出归属、保留原始证据、源码对应关系与静态基线规则足够；本次通过具体管线回归和交付文档落实。未来更换录制器、FFmpeg 处理方式或清单结构时，重跑目录归属、阶段字节绑定和双时间轴回归，并重新检查真实素材。
