# @weapp-tailwindcss/env

## 0.2.0

### Minor Changes

- 增加 Taro 和 MPX 的显式环境快照平台解析入口，并通过主包根入口及 framework 兼容入口导出，保持旧单值 API 的默认环境契约。Refs #1300。

- 新增统一平台身份与可解释的框架检测报告，修复 MPX 别名安全查找、ali/dd 小程序分类及脚本文件参数误识别，并通过主包 framework 入口同步提供函数与类型。

### Patch Changes

- 修复带行注释或块注释的 Uni manifest 无法识别 uni-app x 的问题，保留严格 package.json 与损坏文件回退行为。Refs #1299。

- 修复 scripts 检测将引用的变量名或等号误当作 shell 环境赋值的问题，避免后续参数覆盖真实框架依赖；保留合法值引用、续行及 env/cross-env 包装器的赋值参数语义。Refs #1296。

## 0.1.0

### Minor Changes

- 提炼独立的环境、框架与平台识别包 `@weapp-tailwindcss/env`，支持构建期独立使用，并保留主包及 `weapp-tailwindcss/framework` 的既有公开入口。

  修正显式环境变量快照中缺失的 UNI 字段意外回退到进程环境的问题；空快照和部分快照只使用调用方传入的值，省略环境参数时继续读取当前进程环境。

  新包初始化为 `0.1.0`，按 pnpm 首发使用 manifest 版本的规则交给 repoctl 编排；后续发布继续按 change intent 升版。
