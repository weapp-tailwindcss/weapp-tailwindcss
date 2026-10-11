---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1262
baseline: 0bfb23912f59cfaf0b58b00353d7f08122d1f8f1
regressions:
  - packages/cli/test/watch-lifecycle.test.ts
  - packages/cli/test/watch-map.test.ts
  - packages/cli/test/output-collision.test.ts
  - packages/cli/test/build-write-boundary.test.ts
  - packages/cli/test/parity-build.test.ts
---

# CLI 持续监听与生成产物边界

## 症状

Refs #1262、#1263、#1264。原生 watch 空闲后不再消费后续更新；外置 map 被轮询当作输入而持续重建；map 路径可与输入重合并覆盖源码。

## 根因与纠正

原生循环只在构建结束仍有 pending 事件时重入。改为持续等待循环，并通过统一生命周期管理停止、唤醒、信号清理及在途构建。仅订阅故障触发轮询回退，编译错误不改变后端。

监听器原本只有单一 CSS output，没有完整产物集合。现在原生与轮询均过滤 CSS 和外置 map，使用相同的规范化路径、真实路径和文件身份匹配。

map 原本在生成函数内直接写入。现在生成阶段返回内容，在写入所有产物前统一校验输入、CSS、map 的身份，兼容符号链接目录下尚不存在的输出和硬链接。路径校验在参数解析、每轮生成前及生成后执行，避免编译期间已出现的路径别名导致覆盖。

## 验证

初始定向回归确认原生第三轮更新缺失、map 反馈循环及三组参数冲突均失败；修复后这些回归通过。增加真实 CLI 连续原生更新、外置 map 根目录/子目录轮询、写入前文件保护，以及构建期间路径身份变化的回归。

真实 CLI 回归进一步发现首次构建后的初始化快照会吞掉刚新增的项目内文件。补确定性失败用例后，将补充基线限制为项目外依赖，项目内新增保持待处理。

轮询测试不把一次文件写入等同于固定次数的文件系统事件：写入可能分多步被观察，验收同时检查更新生效和随后多个轮询周期保持稳定。

验证入口：

- `CI=1 pnpm exec vitest run --project=@weapp-tailwindcss/cli --project=@weapp-tailwindcss/init --update=none --coverage.enabled=false`
- `pnpm --filter @weapp-tailwindcss/cli build`
- `pnpm --filter @weapp-tailwindcss/cli lint`
- `pnpm --filter @weapp-tailwindcss/cli exec tsc -p tsconfig.json --pretty false`

## 适用边界

本地真实 watcher/CLI 验证环境为 macOS、Node.js 24.18.0、pnpm 12.6.0。Windows 路径语义使用 node:path.win32 验证，真实跨平台表现由最终 PR 的适用 CI 补充；未执行本地全端 IDE/设备验收。写入前身份检查不是针对外部恶意并发替换文件的事务锁。

## 规则评估

不新增 AGENTS 规则。现有生命周期、跨平台路径及失败先复现原则足够，改进固化为持久回归。严格类型检查同时纠正 CLI 既有索引签名访问、可选字段及 JSONL 回调签名问题，不改变 CLI 参数或输出契约。
