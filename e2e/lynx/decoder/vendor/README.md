# 固定的 Lynx bundle decoder

`lepus.cjs.gz` 是准确 `@lynx-js/tasm@0.0.53` 对应源码加本目录两份解码补丁后，用 Emscripten 4.0.22 构建的便携 WASM。普通 CI 只读取此固定产物；解码失败不得回退本机二进制、serializer 输入或源 CSS。

来源、补丁、工具链、输入归档与输出字节的 SHA-256 见上级 `manifest.json` 和 `rebuild/inputs.json`。许可原文在 `licenses/`；`manifest.json` 列出每份文件的来源、长度和 SHA-256。

首轮已完成 433 个 C++ 编译目标、独立链接及真实 1,946 字节 bundle 的 17 条选择器解码。原始 JS 为 13,254,390 字节，gzip 为 2,235,071 字节。编译和链接保持上游参数，包括 `-g`、`SINGLE_FILE=1` 和同步 WASM 初始化；新增代码仅使用解码接口。

第二次独立路径的完整构建尚待完成，首轮结果不代表已证明字节可重复。构建工具只在维护者更新产物时运行，不作为普通 CI 的动态兜底。

生成 gzip 和许可清单使用 `pnpm exec tsx e2e/lynx/decoder/rebuild/package.ts --source <解压源码目录> --emsdk <准确 SDK 目录> --input <实际 lepus.js>`。完整的源码准备及重建入口随后补齐；禁止手改 gzip/WASM。
