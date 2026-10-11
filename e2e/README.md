# E2E Demo 覆盖说明

本地多端 E2E 的统一执行手册见 [`LOCAL-MULTI-PLATFORM-E2E.md`](LOCAL-MULTI-PLATFORM-E2E.md)。其中包含换电脑后的工具链准备、设备 ID 配置、HBuilderX/DevEco 运行边界、静态矩阵、HMR、五端截图、结构探针、像素差异和阻塞记录方式。

本目录的 demo 覆盖矩阵由 `e2e/demoCoverageMatrix.ts` 维护，并由 `e2e/e2e-matrix.test.ts` 校验。矩阵会扫描 `demo/*/package.json` 与 `demo/web/*/package.json`，确保每个 demo、平台脚本、静态构建、HMR 或本地豁免都有明确状态。

常用验证命令：

- 小程序静态 + watch/HMR：`pnpm e2e:mp`
- 小程序 IDE 全链路：`pnpm e2e:mp:ide`
- H5 构建 + 浏览器 HMR：`pnpm e2e:h5`
- HBuilderX 本地全链路：`pnpm e2e:hbuilderx`
- HBuilderX 小程序：`pnpm e2e:hbuilderx:mp`
- HBuilderX H5：`pnpm e2e:hbuilderx:h5`
- App 全平台本地链路：`pnpm e2e:app`
- App HMR 产物链路：`pnpm e2e:app:hmr`
- App 前后截图链路：`pnpm e2e:app:visual`
- Android 本地 HMR + 前后截图链路：`pnpm e2e:android`
- Android HMR 产物链路：`pnpm e2e:android:hmr`
- Android 前后截图链路：`pnpm e2e:android:visual`
- iOS 本地 HMR + 前后截图链路：`pnpm e2e:ios`
- iOS HMR 产物链路：`pnpm e2e:ios:hmr`
- iOS 前后截图链路：`pnpm e2e:ios:visual`
- Harmony 本地链路：`pnpm e2e:harmony`
- 总矩阵一致性：`pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/e2e-matrix.test.ts`
- 静态小程序快照：`E2E_SKIP_OPEN_AUTOMATOR=1 pnpm e2e:static`
- React Native / Expo Metro export：`pnpm e2e:react-native-expo`
- React Native 三端 118 项兼容性 gate：`pnpm e2e:react-native-compatibility`
- React Native Expo Web 真实运行时、截图与 TSX/CSS HMR：`pnpm e2e:react-native:web`
- React Native Android 运行时、截图与 HMR：`pnpm e2e:react-native:android`
- React Native iOS 运行时、截图与 HMR：`pnpm e2e:react-native:ios`
- React Native 三端汇总 gate：`pnpm e2e:react-native:all`
- React Native 受控静态基线更新：`pnpm e2e:react-native:update`
- 多平台构建输出：`pnpm e2e:multiplatform-build`
- 单个平台构建输出：`E2E_MULTIPLATFORM_BUILD_CASE="<demo> <platform>" pnpm e2e:multiplatform-build`
- demo watch/HMR：`pnpm e2e:hot-update:demo`
- 单个 watch/HMR case：`E2E_HOT_UPDATE_CASE_NAME=<demo> pnpm e2e:hot-update:demo`
- 微信开发者工具 IDE 类名 HMR：`pnpm e2e:ide`
- 微信开发者工具 IDE 类名 HMR + 前后截图：`pnpm e2e:ide:visual`
- 单个 demo 的 IDE 前后截图：`DEMO_VISUAL_FILTER=<demo> pnpm e2e:ide:visual:case`
- 完整 IDE HMR 流程：`pnpm e2e:ide:full`
- Web Vite HMR：`pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/web-vite-demo-hmr.test.ts`
- Web 与 weapp 模式对比：`pnpm demo:web:compare`
- HBuilderX 本地链路：`E2E_HBUILDERX_LOCAL=1 pnpm e2e:hbuilderx:local`

HBuilderX / App / 模拟器相关 case 依赖本机工具链，默认不进入普通 CI。矩阵中的 `reason` 字段记录了跳过原因和对应本地命令。后续组合执行时优先使用 `e2e:mp`、`e2e:h5`、`e2e:hbuilderx:*`、`e2e:android`、`e2e:ios`、`e2e:harmony` 这一层分组命令；`e2e:hbuilderx:local:*` 保留为底层兼容入口。
`e2e:ide:visual` 会遍历 `demo/*` 的所有小程序 demo，在微信开发者工具里截取 HMR 前后画面；任一 demo 跳过、失败或没有匹配结果都会让命令失败。
为避免连续打开多个 demo 后连接残留影响后续 HMR，IDE 测试收尾时断开本次自动化连接，并通过官方 CLI 的 `close --project` 只关闭本次项目；不会退出共享 IDE 或按进程名称清理。截图链路在 launch 超时后最多重试一次，失败的项目同样按路径关闭。非默认安装路径通过 `E2E_PREFLIGHT_WECHAT_CLI` 指定。
模板 IDE 验收使用 `pnpm e2e:templates:ide`。游客 AppID 在部分基础库中会触发 `webapi_getwxaasyncsecinfo:fail`；可通过 `E2E_TEMPLATE_IDE_APP_ID` 显式指定当前账号有开发权限的小程序 AppID。测试仅临时改写项目配置，关闭本次项目后按原始字节恢复；发现外部修改则保留现场并报错。该参数不改变模板源码或运行时错误断言，未配置时保持模板原有 AppID。
`e2e:android` 和 `e2e:ios` 会先运行 HBuilderX App 开发态 HMR 产物断言，再运行 App visual report，并在同一个 App launch 进程内写入 HMR marker、等待增量产物、截取 `hmr-before.png` 与 `hmr-after.png`。截图默认落在 `e2e/.artifacts/demo-visual/full/screenshots/<demo>/<platform>/`，`--fail-on-incomplete` 会让跳过、失败或没有匹配结果直接失败。
