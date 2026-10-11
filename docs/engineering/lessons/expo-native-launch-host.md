---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1220
baseline: b8e0da77d1a5c036284bb9d3b9dd1c154e80b1f2
regressions:
  - e2e/react-native-ci.test.ts
---

# Expo 原生启动地址一致性

## 症状

GitHub Actions run `35379409716` 的 iOS job `105711748124` 原生编译成功，但 `simctl openurl` 返回 60 超时。任务设置了 `RN_IOS_HOST=127.0.0.1`，启动链接却包含 `192.168.64.4:8081`。

## 根因与纠正

Metro 与原生启动分别运行在 `expo start --localhost` 和 `expo run ios --no-bundler` 进程中。前者的参数不会传递给后者；后者仍按默认 LAN 模式生成开发链接。公共子进程环境现在显式设置 `REACT_NATIVE_PACKAGER_HOSTNAME`，使 Metro、首次启动和后续恢复使用同一个已选宿主地址。

地址不一致已经确认；模拟器超时是否还有其他环境原因，需要修复后的设备任务验证，不能仅凭地址修改宣称已解决全部启动失败。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ci.test.ts e2e/react-native-native-wait.test.ts --update=none`
- 测试使用示例实际安装的 Expo `UrlCreator`，覆盖 localhost/LAN 两种启动模式、回环地址和显式局域网地址，并验证覆盖错误的继承环境值。
- 本次仅调整验收启动环境，未修改示例源码或样式产物，因此无需重生成 static 快照。

## 适用边界

适用于当前锁定的 Expo 54 CLI；升级 Expo 时由真实 URL 生成器回归检测其环境变量契约。原生构建、运行时报告、HMR 与截图仍必须正常完成，不能因原生编译成功而跳过。

## 规则评估

不新增 AGENTS 规则。现有进程归属、服务身份和首次失败层级要求已覆盖此问题，使用持久回归补齐验证。
