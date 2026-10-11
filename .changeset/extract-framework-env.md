---
"@weapp-tailwindcss/env": minor
"weapp-tailwindcss": patch
---

提炼独立的环境、框架与平台识别包 `@weapp-tailwindcss/env`，支持构建期独立使用，并保留主包及 `weapp-tailwindcss/framework` 的既有公开入口。

修正显式环境变量快照中缺失的 UNI 字段意外回退到进程环境的问题；空快照和部分快照只使用调用方传入的值，省略环境参数时继续读取当前进程环境。

新包初始化为 `0.1.0`，按 pnpm 首发使用 manifest 版本的规则交给 repoctl 编排；后续发布继续按 change intent 升版。
