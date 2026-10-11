---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 09c7d2b63b7d239f3a7d07d770e164da8946e687
regressions:
  - e2e/android-runtime-sampling.test.ts
  - e2e/android-ui-hierarchy.test.ts
  - e2e/app-visual-lifecycle.test.ts
---

# Android marker 与截图必须属于同一稳定采样

## 症状

HBuilderX `5.31.2026093020-alpha` 的 VDOM、样式隔离 2.0 Android 验收中，首次增量截图仍显示旧 marker，采样结果却记录 `markerTextVisible=true`。本轮证据位于 `e2e/.artifacts/uni-app-x-alpha/38e09ffe-e55b-4379-a6fa-4fa67d3527e3/runtime/uni-app-x-vdom-tailwindcss-v4-android/` 的 `hbuilderx.log`、`initial.png` 和 `append-mt-200-to-existing-node.png`。

截图保存时间为 `2026-10-03T12:33:18.984Z`，早于增量编译完成的 `12:33:19.491Z` 和第二次 AppLaunch 的 `12:33:20.679Z`。两张截图 marker 区域的解码像素未变，右侧滚动条有 7150 个像素变化；旧实现仍把整张 PNG 字节差异当作 HMR 更新证据。纯 HMR 生命周期门槛另外检测到了重启，因此该次设备验收仍失败。

## 根因与纠正

旧流程先截图再 dump UI，可能将编译前画面和编译后 marker 拼接成一份证据。marker 仅做 XML 子串匹配，缺失边界时又允许使用全屏颜色边界，无法保证文本、位置与被测像素对应。整张 PNG 字节比较同时受区域外动画和编码差异影响。

现在先读取精确匹配 text 或 content-desc 且边界有效的 marker，再截图，随后再次读取 UI；前后 marker 的文本、描述和全部边界必须一致。缺失 marker 时不截图，采样期间变化时丢弃该轮；采集命令失败直接拒绝证据，保持独占设备文件的清理机制。

图像解码为 RGBA，仅比较当前 marker 边界内的像素。前一张截图在相同坐标取样，因而移动到新位置造成的可见变化可以被检测；越界、零面积或截图尺寸变化直接拒绝，不裁切、不回退到全屏。颜色、尺寸、文本像素和纯 HMR 生命周期门槛保持不变。

## 验证

修复前的首批 11 项采样回归全部失败；扩展后的 18 项回归有 17 项失败。修复后补充 content-desc 成功路径及截图宽、高不一致回归，以真实 PNG、宿主临时文件和 mock adb 验证采样边界，不操作真实设备。

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/android-runtime-sampling.test.ts e2e/android-ui-hierarchy.test.ts e2e/hbuilderx-local-helpers.test.ts e2e/app-visual-lifecycle.test.ts --update=none`：62 项通过，其中采样回归 21 项。覆盖旧画面与新 UI 顺序、等待 marker、采样中消失/改文案/移动、属性误命中、无效边界、截图及后置 dump 失败、仅滚动条变化、仅编码变化、区域内像素变化、越界和截图尺寸变化。

目标文件 ESLint、新采样与 UI 采集模块的严格 TypeScript 检查、`pnpm agents:check` 和 `git diff --check` 通过。未修改 demo、样式输出或 static 基线。新模块类型检查使用 `pnpm exec tsc --ignoreConfig --noEmit --target ESNext --module ESNext --moduleResolution Bundler --types node --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --skipLibCheck e2e/hbuilderx-local/android-runtime/marker-sample.ts e2e/hbuilderx-local/android-runtime/ui-hierarchy.ts`。

## 适用边界

双次 UI 采样建立有界一致性，仍不是原子截图、OCR 或渲染器同步协议。区域内 RGBA 变化也不能单独证明指定样式已生效，仍需共同通过现有颜色、尺寸和文本检查。真实 Alpha 5.31 设备重跑应由主流程集成后重新预检执行，本次 mock 回归不宣称设备验收通过，也不宣称原生增量编译重启问题已修复。

## 规则评估

不新增 AGENTS 规则。现有本轮保存标识、有效截图和禁止回退验收门槛已覆盖该问题；通过采样实现和持久回归落实这些边界。
