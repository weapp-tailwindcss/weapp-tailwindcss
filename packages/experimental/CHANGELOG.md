# @weapp-tailwindcss/experimental

## 0.0.49

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.4.0

## 0.0.48

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.11
  - @weapp-tailwindcss/shared@2.0.4

## 0.0.47

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.10

## 0.0.46

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.9

## 0.0.45

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.8

## 0.0.44

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.7

## 0.0.43

### Patch Changes

- 将共享生成流程、Vite 产物清理、Webpack 兼容和 Harmony apply 的样式变换归入 PostCSS 包，保留主包编排接口，减少重复解析、声明签名计算和未命中规则克隆。

  继续统一源码追踪、主题与引用组装、import 改写、候选扫描和入口指纹；删除重复的 inline/config/source 解析，复用单次调用的 CSS 分析结果，同时保持文件解析、平台和构建会话归主包管理。

  将 Vite 预处理前独占行的 `@config` 清理一并迁入 PostCSS，保留 Sass 源码兼容及原有换行语义。

  将 React Native CSS 编译迁入独立 PostCSS native 子入口，保留原编译器 API、精确类名过滤、告警与稳定 ID；运行时不加载 CSS 编译依赖。

  将 injector 的纯指令插入和 LightningCSS 的实验性样式转换归入 PostCSS。模板依赖追踪仍由 injector 管理；LightningCSS 引擎仍只由实验入口加载，稳定入口不导入实验实现。

  修复完整验收中发现的既有 uni-app x Web 类名身份不一致：Web 模板与脚本保留生成器使用的原始变体类名，局部样式仍按精确候选生成别名，小程序转换行为保持不变。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.6

## 0.0.42

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.5

## 0.0.41

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.4

## 0.0.40

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.3

## 0.0.39

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.2

## 0.0.38

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.1

## 0.0.37

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.0

## 0.0.36

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.2.12
  - @weapp-tailwindcss/shared@2.0.3

## 0.0.35

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `@weapp-tailwindcss/postcss@3.2.11`, `@weapp-tailwindcss/shared@2.0.2`

## 0.0.34

### Patch Changes

- 📦 **Dependencies** [`8287ade`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8287ade3e759bad448d8954076573e2848f45fae)
  → `@weapp-tailwindcss/postcss@3.2.10`

## 0.0.33

### Patch Changes

- 📦 **Dependencies** [`1dcb3b3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1dcb3b3a57ae088f2105e594db2df5a99225be45)
  → `@weapp-tailwindcss/postcss@3.2.9`

## 0.0.32

### Patch Changes

- 📦 **Dependencies** [`5066997`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5066997beef53842a2e97da3af064d1349ea00be)
  → `@weapp-tailwindcss/postcss@3.2.8`

## 0.0.31

### Patch Changes

- 📦 **Dependencies** [`5f1fa8c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5f1fa8c782ec6044e54890d31af6cb3788f80c59)
  → `@weapp-tailwindcss/postcss@3.2.7`

## 0.0.30

### Patch Changes

- 📦 **Dependencies** [`b394b1b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b394b1baa945109ba93760b13bfcd12abacdab4f)
  → `@weapp-tailwindcss/postcss@3.2.6`

## 0.0.29

### Patch Changes

- 📦 **Dependencies** [`3f3f3b3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3f3f3b3045d9aac099a359b514cd9f3b7cab1d3f)
  → `@weapp-tailwindcss/postcss@3.2.5`

## 0.0.28

### Patch Changes

- 📦 **Dependencies** [`67c90de`](https://github.com/sonofmagic/weapp-tailwindcss/commit/67c90de8a94716664561dc2898cb7bbde338c7cc)
  → `@weapp-tailwindcss/postcss@3.2.4`

## 0.0.27

### Patch Changes

- 📦 **Dependencies** [`d28f70d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d28f70dbb581673416868a5bb9517e82e0e24c98)
  → `@weapp-tailwindcss/postcss@3.2.3`

## 0.0.26

### Patch Changes

- 📦 **Dependencies** [`b52a84b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b52a84b2aa17a123156ed094e6c6a72a405ac2ce)
  → `@weapp-tailwindcss/postcss@3.2.2`

## 0.0.25

### Patch Changes

- 📦 **Dependencies** [`62ac4c0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/62ac4c0fd1619dfb10639455f412634335c00001)
  → `@weapp-tailwindcss/postcss@3.2.1`

## 0.0.24

### Patch Changes

- 📦 **Dependencies** [`8d9cc88`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d9cc8878cc430a4953579e2c76213402f0932e1)
  → `@weapp-tailwindcss/postcss@3.2.0`, `@weapp-tailwindcss/shared@2.0.1`

## 0.0.23

### Patch Changes

- 📦 **Dependencies** [`da88a42`](https://github.com/sonofmagic/weapp-tailwindcss/commit/da88a42f41ffa1ce0de365d7708526a963ab3165)
  → `@weapp-tailwindcss/postcss@3.1.12`

## 0.0.22

### Patch Changes

- 📦 **Dependencies** [`09bdcc7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/09bdcc7c47621ca88f526b57f544343885753ecc)
  → `@weapp-tailwindcss/postcss@3.1.11`

## 0.0.21

### Patch Changes

- 📦 **Dependencies** [`fb32eae`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fb32eaeef309c0f129a60214b389d8615e6b669d)
  → `@weapp-tailwindcss/postcss@3.1.10`

## 0.0.20

### Patch Changes

- 📦 **Dependencies** [`c0565ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c0565ad2dad6adf2420348e5a490a763e853721c)
  → `@weapp-tailwindcss/postcss@3.1.9`

## 0.0.19

### Patch Changes

- 📦 **Dependencies** [`b2cbe21`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b2cbe214e3958cb5febf3a46ba0c4b14af76c27b)
  → `@weapp-tailwindcss/postcss@3.1.8`

## 0.0.18

### Patch Changes

- 📦 **Dependencies** [`46ef156`](https://github.com/sonofmagic/weapp-tailwindcss/commit/46ef156233bc756de23df019272afbaf83785c8d)
  → `@weapp-tailwindcss/postcss@3.1.7`

## 0.0.17

### Patch Changes

- 📦 **Dependencies** [`ed75e33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ed75e33c4342c98b198d60107c1bca13cbb8b607)
  → `@weapp-tailwindcss/postcss@3.1.6`

## 0.0.16

### Patch Changes

- 📦 **Dependencies** [`747dcf3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/747dcf34a1cf77a14b859ee86f537ce2cd89bddd)
  → `@weapp-tailwindcss/postcss@3.1.5`

## 0.0.15

### Patch Changes

- 📦 **Dependencies** [`0e08dac`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0e08dacbe3de03a83a5c7b675adffaf6d0e81e3f)
  → `@weapp-tailwindcss/postcss@3.1.4`

## 0.0.14

### Patch Changes

- 📦 **Dependencies** [`64faef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64faef437046ca1b3f438a2e55d101895500f7a5)
  → `@weapp-tailwindcss/postcss@3.1.3`

## 0.0.13

### Patch Changes

- 📦 **Dependencies** [`9ce2cd5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9ce2cd590ea2a373f4372d499a10ed8a2d333d0c)
  → `@weapp-tailwindcss/postcss@3.1.2`

## 0.0.12

### Patch Changes

- 📦 **Dependencies** [`ddcb7c8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddcb7c82d00a06be462c13b7d11d4367c1b1091e)
  → `@weapp-tailwindcss/postcss@3.1.1`

## 0.0.11

### Patch Changes

- 📦 **Dependencies** [`1dc7b97`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1dc7b9766df9ab218e1eedb0eec392e4d0a7f515)
  → `@weapp-tailwindcss/postcss@3.1.0`

## 0.0.10

### Patch Changes

- 📦 **Dependencies** [`d3487a1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d3487a1b669bb194cdbfa0cd7a412e970b01632d)
  → `@weapp-tailwindcss/postcss@3.0.8`

## 0.0.9

### Patch Changes

- 📦 **Dependencies** [`2d3d5ca`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d3d5ca36df873b941baddfcdb0134965bc62f94)
  → `@weapp-tailwindcss/postcss@3.0.7`

## 0.0.8

### Patch Changes

- 📦 **Dependencies** [`d13bd91`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d13bd91f0d59118d4a2df01e8d3ec69eccb473f0)
  → `@weapp-tailwindcss/postcss@3.0.6`

## 0.0.7

### Patch Changes

- 📦 **Dependencies** [`4e9d664`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4e9d66437832957a39bb1966a2c352a0e8a6e49e)
  → `@weapp-tailwindcss/postcss@3.0.5`

## 0.0.6

### Patch Changes

- 📦 **Dependencies** [`92c822e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/92c822eb29be8ad3571bb0a7fc27327e6defb19c)
  → `@weapp-tailwindcss/postcss@3.0.4`

## 0.0.5

### Patch Changes

- 📦 **Dependencies** [`65f084b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/65f084ba30ad8a0b4c36ce46e567d2e1b1490b64)
  → `@weapp-tailwindcss/postcss@3.0.3`

## 0.0.4

### Patch Changes

- 📦 **Dependencies** [`2f41ff5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2f41ff5c5861828b3cafe0a1248c7eecd690cfb7)
  → `@weapp-tailwindcss/postcss@3.0.2`

## 0.0.3

### Patch Changes

- 📦 **Dependencies** [`206093e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/206093e9878e6f4456bbd72f1a61856abc86fc88)
  → `@weapp-tailwindcss/postcss@3.0.1`

## 0.0.2

### Patch Changes

- 🐛 **将小程序 CSS 清理、收尾与兼容处理集中到 `@weapp-tailwindcss/postcss`，主包仅保留兼容导出与构建器编排；同时把实验性的 Lightning CSS 样式处理迁移到 `@weapp-tailwindcss/experimental/lightningcss`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
- 📦 **Dependencies** [`73a7794`](https://github.com/sonofmagic/weapp-tailwindcss/commit/73a7794d50916d2189f22bfaa9e9ab9402b30df7)
  → `@weapp-tailwindcss/postcss@3.0.0`, `@weapp-tailwindcss/shared@2.0.0`

## 0.0.2-next.4

### Patch Changes

- 📦 **Dependencies** [`e6f624f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e6f624f5e69bb5a85df9ac93fda1badfd31f2bce)
  → `@weapp-tailwindcss/postcss@3.0.0-next.10`

## 0.0.2-next.3

### Patch Changes

- 📦 **Dependencies** [`aaba811`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaba811cfc2ad003d3daf2cf290c9d8b770c6dfb)
  → `@weapp-tailwindcss/shared@2.0.0-next.1`, `@weapp-tailwindcss/postcss@3.0.0-next.9`

## 0.0.2-next.2

### Patch Changes

- 📦 **Dependencies** [`2d2acf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d2acf29cfee02ffb32783c8bd3c5de8d9aab9df)
  → `@weapp-tailwindcss/postcss@3.0.0-next.8`, `@weapp-tailwindcss/shared@2.0.0-next.0`

## 0.0.2-next.1

### Patch Changes

- 📦 **Dependencies** [`29901e2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/29901e2b1d7fc6ec83d73a202e8f60e186d1b022)
  → `@weapp-tailwindcss/postcss@3.0.0-next.7`

## 0.0.2-next.0

### Patch Changes

- 🐛 **将小程序 CSS 清理、收尾与兼容处理集中到 `@weapp-tailwindcss/postcss`，主包仅保留兼容导出与构建器编排；同时把实验性的 Lightning CSS 样式处理迁移到 `@weapp-tailwindcss/experimental/lightningcss`。** [`649d229`](https://github.com/sonofmagic/weapp-tailwindcss/commit/649d2296a164a301ec7d40de093d2e1ccb8e60f1) by @sonofmagic
- 📦 **Dependencies** [`649d229`](https://github.com/sonofmagic/weapp-tailwindcss/commit/649d2296a164a301ec7d40de093d2e1ccb8e60f1)
  → `@weapp-tailwindcss/postcss@3.0.0-next.6`

## 0.0.1

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 0.0.1-alpha.0

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade
