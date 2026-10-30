---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1320
baseline: e769e69b97c88b379a80d3cabca4fa20330b999a
regressions:
  - scripts/ci/demo-matrix/mpx-webpack-compat.test.mjs
  - e2e/react-native-http-archive-owner.test.ts
  - e2e/templates-build-smoke.test.ts
  - e2e/wechat-service.test.ts
  - packages/test-helper/test/update-packages/runner.test.ts
  - packages/minify-preserve/test/bundler-config.test.ts
---

# 依赖升级必须验证实际消费者边界

## 症状

安装和补丁专项通过后，完整根构建及 Windows Mpx watch 在插件入口即失败：`Cannot find module 'webpack/lib/dependencies/ModuleDependency'`。网站合同仍引用旧 Lynx 版本；Expo 观察测试预期旧 CLI；Lynx 原生流程拒绝历史 static 身份。微信 isLogin 连接失败也曾被笼统描述为 IDE 不可用。

## 根因与纠正

Webpack 5.112.2 移动内部目录，Mpx 2.11.1 的安装 peer 正确而私有导入失效。扫描实际依赖闭包后，集中迁移 8 类请求到公开导出，仅为未公开的入口导出保护插件集中解析新旧路径；解析回落与模块加载分开，避免吞掉真实缺依赖。根及独立模板同步精确补丁。

版本文本、安装身份、static 编码证据、真实原生运行各自独立。同步文档与 Expo 精确消费版本；重新生成 Lynx static 并审查差异，不能把新身份或 build 成功当作设备通过。360 使用 Vue 2 的完整旧编译器组，其产物继承 H5，不能添加到 Vue 3 小程序矩阵或断言 WXML。

连接阶段记录目标端口及白名单网络错误，未知错误正文不回显。单次连接失败不能证明 IDE 未打开；依用户要求允许核对实例后的受控启动/重启，同时保护登录、票据、缓存与无关项目。

包管理器 fixture 也属于真实消费者：工具锁只有 importer 而缺包元数据时，版本对齐仍可能触发重新解析。复制根真实工具文档，同时保留显式版本覆盖测试；假 registry 按包响应，不能将未知请求伪装成已知包。压缩产物升级先执行 bundle 验证函数名语义，再更新被移除的未用运行时代码快照。

## 验证

PR 初始 head 7f8df54041940450426208fc9e57a91f2b55e3db，加本轮未提交修复，在 macOS ARM64、Node 24.22.1、pnpm 12.15.0 执行：

- Mpx 6 项兼容回归及三个真实消费者生产构建通过；根与独立模板 frozen install 通过。
- Lynx 定向 static 更新后，3 文件/83 项禁止更新复验通过。
- Expo HTTP 观察 12 项、360 模板矩阵与真实产物 2 项通过。
- 微信诊断/登录边界 3 文件/44 项曾通过，完整扩展预检及当前会话 computer use 也通过；完整流程随后在根构建失败即停止。

准确命令和后续结果见[升级记录](../dependency-upgrade-20261028.md)。

head 9d8636e3a14e6f89bbe71ba0b7d3c87fbe4d9918 的新完整预检通过，根构建通过，单测剩余上述 fixture 两项和压缩快照一项失败后停止。增加本轮修复后，fixture/依赖快照 32 项和四种压缩配置 4 项定向禁止更新复验通过；这不是完整流程通过。

## 适用边界

上述验证不能代替 Webpack/Mpx HMR、WXS 子编译行为、Lynx 布局/像素、360 宿主及完整设备验收。Lynx 编码中的 flex-basis 从 0 变为 0%，不假定在所有布局下等价。完整 PR CI/CD、本地扩展流程与进程清理超时仍待验收。

## 规则评估

沿用全面升级的实际消费者、静态基线与完整预检要求，不为版本升级增加另一套门禁。微信规则按用户明确授权更新，未降低账号、票据、缓存与项目归属保护。
