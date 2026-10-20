# Lynx bundle 解码 oracle

<!-- agents:cwd=root -->

## 适用范围

适用于本目录的独立 decoder、源码补丁、构建脚本和固定产物。

## 核心职责

从实际 bundle 字节读取编码结果，固定源码、补丁、工具链、许可与产物身份。

## 变更原则

- 禁止手工编辑生成的 gzip/WASM；变更先落到源码补丁，再运行重建脚本。
- decoder 失败必须阻断，禁止回退 serializer 输入、源 CSS、未修复 decoder 或本机原生二进制。
- 补丁只修复解码或文本表示，不修改 encoder、被测 bundle、平台预期和原生匹配行为。
- 普通 CI 消费同一便携产物，校验压缩、解压和补丁 hash；更新时重复构建并记录字节可重复性及差异。
- 生成、编码和原生运行时证据各自验证，decoder 测试不启动设备或浏览器。

## 测试要求

保留实际 bundle 的修复前后对照；属性、选择器、条件或产物身份丢失的负向回归必须拒绝。

## 推荐验证命令

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-decoder.test.ts e2e/lynx-media-guard.test.ts --update=none`

## 提交前检查

检查源码与补丁来源、产物 hash、许可、临时资源清理，以及受影响的 static 基线。
