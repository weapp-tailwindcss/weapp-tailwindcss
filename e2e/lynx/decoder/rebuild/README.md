# Lynx 便携 decoder 的维护者重建

普通 CI 校验并加载已提交的 `packages/lynx/src/decoder-data/vendor/lepus.cjs.gz`。本入口只在维护者更新补丁或审计产物时使用，不是运行时 fallback，不需要设备、IDE 或浏览器。

准备仓库规定的 Node/pnpm、Git、Ninja、Python 3.10 以上，以及 `inputs.json` 固定 commit 的 emsdk。SDK 必须在独立目录中解压并核归档 SHA-256，再执行 `python emsdk.py install 4.0.22` 和 `python emsdk.py activate 4.0.22 --embedded`；不要修改全局 profile。可将 `--sdk-python` 指向 SDK 内的 Python。首次安装需要下载官方工具链；本轮 macOS arm64 编译器原始归档的 URL、长度与 SHA-256 见 `inputs.json.compilerArchive`。

重建命令：

```sh
pnpm exec tsx e2e/lynx/decoder/rebuild/index.ts --emsdk <SDK目录> --sdk-python <Python可执行文件>
```

入口每次用 `os.tmpdir()` 下的新目录，从固定 SHA-256 归档开始准备源码与依赖，核两份补丁再应用，并用固定 PyYAML 生成上游 C++ 错误码。`bootstrap-inputs.json` 登记生成器依赖、Emscripten 源 commit、LLVM commit、emcc 脚本 hash 和已登记宿主的 clang 二进制身份。SDK 校验同时检查安装 receipt、实际 emcc/clang 的版本与 commit，不能只替换 `version.txt`。

PrimJS 的合法头文件软链接会在校验边界后物化为普通文件，避免依赖 Windows 软链接权限。tar 的成员、链接和 GN 字符串单独验证逻辑路径与宿主路径；空格、反斜杠、盘符和 `$` 均有定向回归。

构建先完成完整归档，再在新的链接目录复现上游 `gen_wasm_js.py` 的参数与归档步骤。上游会在 `emar x` 后 `qc` 回归档；为防止反复追加，一个目录只准链接一次，重试必须重新运行入口创建新目录。保留 `-g` 与所有上游 WASM flags，不更改 encoder 或 bundle。

链接后，实际 bundle 的 17 条选择器 CSS 必须与独立 fixture 的 SHA-256 一致，才记录产物 hash。默认只比较已提交 raw/gzip，不覆盖 vendor。输出中的 `build-evidence.json` 记录编译器实际身份、语义 probe 和两种字节是否相同。首次重建与失败目录均保留供审查，由维护者确认后定向清理。

可用 `--archive-cache <只读缓存目录>` 复用已下载归档，仍逐份检查 SHA-256；`--jobs <1..64>` 限制并发。审查源码、补丁、证据后，显式加 `--publish` 才重新生成 vendor、许可与 manifest，再运行 decoder/media 回归。普通回归禁止传 `--publish`。

本轮两次干净归档重建的 raw/gzip 与首轮一致，见 `packages/lynx/src/decoder-data/vendor/reproducibility.json`。范围为 macOS arm64 的准确工具链；其他宿主的重建状态需另行记录，不能据此声称跨宿主的字节可重复。

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-decoder-rebuild.test.ts e2e/lynx-decoder.test.ts e2e/lynx-media-guard.test.ts --update=none
```
