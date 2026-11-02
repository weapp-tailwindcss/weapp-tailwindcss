# uni-app-x-vapor-tailwindcss-v4

`uni-app x + Vapor + Tailwind CSS v4` 的 #1119 最小回归 demo。

## 关键配置

- `vite.config.ts` 直接注册 `WeappTailwindcss(uniAppX(...))`
- `main.css` 使用 `@import "tailwindcss"` 与 `@source`
- `App.uvue` 的全局 `<style>` 使用 `@import './main.css'`，把生成入口加入 HBuilderX 构建图
- 显式配置 `cssEntries`，使用项目根目录解析主入口的绝对路径
- 不注册 `@tailwindcss/postcss`，也不注册 `@tailwindcss/vite`
- uni 插件由共享选择器加载：HBuilderX 使用当前 IDE 提供的编译器路径，npm CLI 使用项目依赖；IDE 插件缺失时立即失败，不混用两个版本。IDE 日志中的 `[uni-toolchain]` 记录实际入口。

## 运行

```bash
pnpm run dev:app-harmony
```

也可以直接用 HBuilderX 导入当前目录运行。

## Issue 回归

页面同时保留 Tailwind `leading-[26px]` 和原生 `line-height: 26px` 对照，便于比较生成的 Harmony style bytes。

## Issue #1325 样式矩阵

首页末尾和 `pages/issue-1325/index` 复用样式矩阵：页面载体、无作者 style、普通 style、scoped style、多个作者 style，以及原生 CSS 对照。六个矩阵色块应保持 `120 × 32 px` 和 `#0e7490`。作者 style 的顺序和 scoped 边界保留，不合并 style 块。

```bash
pnpm --filter @weapp-tailwindcss-demo/uni-app-x-vapor-tailwindcss-v4 run dev:ios:simulator
pnpm --filter @weapp-tailwindcss-demo/uni-app-x-vapor-tailwindcss-v4 run dev:h5
```

H5 实际走项目 npm 编译器的 VDOM 分支，需核对启动日志；它是浏览器对照，不能作为 Vapor+iOS 通过的证据。原生入口继续使用当前 HBuilderX 同套编译器及 manifest 的 Vapor bytecode 配置。

插件层静态基线入口（仓库根目录）：

```bash
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x/vapor-style-demo.test.ts --update=none
```

该基线记录完整 SFC、转换后 SFC、style 索引及生成 CSS，不包含上游原生编译和设备截图。需要更新时，只对上述文件单独使用 `-u`，审查后重新执行禁止更新的命令。

真实 iOS 验收入口在仓库根目录执行，按多端手册绑定设备、保留 IDE 会话：

```bash
CI=1 E2E_HBUILDERX_LOCAL=1 E2E_HBUILDERX_CASE='uni-app-x-vapor-tailwindcss-v4 ios vapor native-reload' pnpm e2e:hbuilderx:local:ios
```

此入口将本轮 token 与子组件作者 style 的新增、替换、删除、恢复合并为一次保存，不触发额外的父页面更新；逐轮保存截图和六个真实 UniElement 矩形。尺寸门禁验证生成的布局持续存在；作者文字颜色和背景色还需结合截图核对。

HBuilderX 5.34、iPhone 18 Pro / iOS 27.2 的首屏及四轮更新已通过。保存会产生新的 `App Launch`；独立的[无插件原生 CSS 对照](../../e2e/fixtures/issue-1325-vapor-native-control/README.md)也会重启，所以此专属入口显式报告 `native-reload`，不计作纯 HMR。其他 iOS/Harmony 用例保持原有模式。`App.uvue` 使用 `script setup` 生命周期，结构探针从原生 dataset Map 读取当前 token。

当前 bytecode 的真实样式在 `unpackage/dist/dev/app-ios/bytes/*.style.bytes`；nativecode 对应 `.style.mm`，两者不可混用。完整验证和原报告间歇故障尚未复现的边界见[排查记录](../../docs/engineering/lessons/uni-app-x-vapor-style-snapshot.md)。
