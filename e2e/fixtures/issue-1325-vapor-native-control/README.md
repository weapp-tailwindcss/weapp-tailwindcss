# Issue #1325 无插件 Vapor 原生更新对照

独立 HBuilderX 项目，仅使用原生 CSS；没有 package.json、Vite 配置、node_modules 或 weapp-tailwindcss。manifest 指定 Vapor bytecode，App 使用 script setup 生命周期。

按[多端手册](../../LOCAL-MULTI-PLATFORM-E2E.md)绑定 iOS 模拟器，在仓库根目录执行：

```sh
CI=1 E2E_HBUILDERX_LOCAL=1 E2E_HBUILDERX_ISSUE1325_CONTROL=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1325-native-control.test.ts --update=none
```

该定向入口与插件验收复用相同的原生会话、生命周期和截图门禁。保存一次，同时更新原生背景色、marker/token 并新增作者 style；要求当轮编译、同步、真实节点和截图全部有效。源码在 finally 中恢复，只清理本任务的运行别名。

HBuilderX 5.34.2026102909、iPhone 18 Pro / iOS 27.2 实测：保存产生一次 App Launch，marker 为173×41且背景从#6d28d9变为#9a3412；这说明无插件也会原生重载。此对照显式使用 native-reload，不证明纯 HMR，也不用于推断原 Issue 的样式丢失根因。完整证据范围见[排查记录](../../../docs/engineering/lessons/uni-app-x-vapor-style-snapshot.md)。
