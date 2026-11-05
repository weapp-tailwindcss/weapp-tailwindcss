---
weapp-tailwindcss: patch
---

将包解析依赖 local-pkg 固定为 1.2.1，保留包路径的字符串类型与 CommonJS 入口。将结果类型断言改为显式返回类型，继续校验字符串路径契约并保持生成声明可移植。

继续由本包维护公开的 paths/platform 配置类型，隔离 1.2.1 和 2.0.0 发布声明共有的未定义 Args 问题；待上游修复声明并完成 ESM/CJS 兼容验证后再迁移 2.x。
