---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 399d635bb559cfd6a0d01369727740e1ffc7f822
regressions:
  - e2e/tailwind-weapp-alpha.test.ts
  - e2e/tailwind-weapp-replay.test.ts
  - e2e/tailwind-weapp-capture.test.ts
  - e2e/tailwind-weapp-compositing.test.ts
---

# 微信颜色权重的支持边界与原始证据重放

## 症状

本轮经用户确认，将未知运行时动态颜色权重登记为小程序平台限制，继续保留静态百分比支持。`bg-sky-500/(--my-alpha-value)` 的权重在运行时改变时，现有终端转换保留不透明 fallback，不能把它当作透明度已生效；将 `color-mix` 简写为 `rgba` 也不能普遍保留数值、越界及原色透明度语义。

## 根因与纠正

- 十一个静态正向案例分别覆盖 0%、25%、50%、100%、小数、原色 alpha 相乘，以及静态根变量、变量别名和分数百分比。
- 有限类切换正向检查 25% → 50% → 25%，保留独立参考和每阶段绝对像素预期。
- 未知运行时权重负向检查 50% → 25% → 50%。目标保持不透明 fallback，独立 `rgba` 参考改变，另用 `opacity:var(...)` 见证变量实际更新。三者必须同时符合预声明语义，不能仅凭两图不同通过。
- 原有动态宽度改用同一阶段协议，检查 32px → 64px → 32px；页面不再按宽度案例硬编码切换。

### 原始证据边界

旧微信报告只校验附件摘要，错误截图重新签名、缺恢复阶段、错误见证和过期 sidecar 均可能被放行。本轮先固化失败回归，再补生产重放：

1. 保存生成 WXSS 和完整项目原件，逐案例登记回执。
2. 每阶段采集页面输入、实际身份文本、目标/参考/见证样式及三块节点几何。
3. 截图标记绑定 run ID、案例、阶段和 CSS 摘要；同色的 before/restored 也不能交换旧图。
4. 重读完整 PNG 和窗口尺寸，以生产色彩归一化及视口裁剪重建截图，逐像素核对裁剪结果，再重算绝对颜色和目标/参考差异。
5. 重放强制要求全部阶段、完整几何和全部原件回执，拒绝孤立裁剪图、双方同错色及与报告不一致的断言。采集异常仍落盘已有测量和原图，原异常继续传播。

合成 PNG 仅用于协议回归，不能登记为微信实际运行。正向和负向端侧验证均须使用新一轮扩展预检、当前会话真实 computer use 与 verify。

### 显示器编码空间中的透明合成

7f3299 的 fresh 扩展预检 `b0a05bf5-5f09-424e-b2b3-e951acda9aec`、当前会话原生 Chrome 交互和 verify 通过后，实际微信 run `c0bc6c3a-7371-4d2c-8477-2f92f7f9153f` 执行14例。动态宽度及四个透明度端点共5例通过，其余9例因绝对像素断言失败，原始报告保持失败。计算样式与主体/独立参考的预声明采样点 RGBA 精确相等断言均符合预期；不能据此改写失败结果。

原始 PNG 的 Skia ICC SHA256 为 `4c0ff0fead968dfabb20d3534cab8e0287146c4cfcdce51a61fd1caa9ba1de7c`。不透明红的原始 RGB 为234/51/35，白色255/255/255；50%红为244/153/145，符合显示器编码空间中两端的插值。转换 sRGB 后为255/147/141，而直接在 sRGB 合成的预设是255/128/128。Sharp/lcms 与生产 Canvas 的独立转换逐字节一致，不支持修改归一化器或放宽容差。颜色转换与带 alpha 的编码空间合成不能交换。

修正后的夹具在同一截图中增加独立不透明前景、背景和中灰控制，先分别对归一化后的 sRGB 绝对颜色执行原有 RGB 一级容差，再对原始 PNG 中主体/参考的 RGB 按预声明 alpha 检查插值残差，仍只允许一级量化误差、alpha精确255、正向主体/参考的预声明采样点 RGBA 精确相同。负向目标预声明alpha=1，参考分别为0.5/0.25/0.5，不从目标或参考反推权重。中灰控制覆盖纯色端点对错误 TRC 不敏感的缺口。只接受普通八位 RGB，以及已登记九类 tag 的矩阵/TRC 显示器 ICC；验证完整 tag 表、偏移、非退化矩阵和曲线定义域、归一化范围及单调非降，拒绝常量曲线。ICC 合法的平台段和向上跳跃不被写成数学连续。HDR、未知转换标签、重复/冲突配置、灰度、索引色、损坏配置及不同合成空间直接失败，不自动更换算法。

此前 `98d6b0a1` 的真实 Chrome 操作已完成，但证据索引字符串不一致导致 verify 拒绝；该报告已显式阻断并关闭服务，没有重新签名放行。最早两轮工具变量缺失、Android遗留Lynx页面无节点的预检也保留失败。仅将本任务Lynx页面返回桌面恢复结构探针，未重置设备、微信认证或用户配置。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-weapp-{alpha,replay,capture,environment,pixels,conversion-oracle}.test.ts e2e/tailwind-mini-program-alpha-limit.test.ts e2e/tailwind-probe-properties.test.ts e2e/tailwind-report.test.ts e2e/tailwind-fixtures.test.ts e2e/wechat-session-boundary.test.ts --update=none`：11 文件、187 项通过。命令中的花括号仅为阅读简写；跨平台入口 `pnpm e2e:tailwind:contract` 已逐文件登记三个新增测试。
- `pnpm e2e:tailwind:static:update`：审查后仅 `weapp.wxss` 和索引变化，其余 47 份样式逐字节保持一致。以 `fixtureBaseline(root, false)` 重新生成全部 48 份产物并执行禁止更新的比较，通过。
- 全部修改的 TypeScript 文件通过 ESLint；微信认证阻断与清理的 7 项回归和会话边界的 5 项回归保持通过。
- `pnpm exec tsc -p e2e/tsconfig.json --pretty false` 仍有全目录的 lib、JSX 与脚本类型错误，不能登记为全量类型检查通过。
- 色彩合成修正的8文件148项定向回归通过；包括双方同错权重、错误绝对控制、缺独立控制、HDR/非RGB配置和不完整原始采样。更新 static 后仅夹具索引 hash 变为 `d84d4f15a3c1f483062d31da083fff7f128663c7834020ec778ea917d0a464c9`，48份样式字节不变。修正后的真实微信重验结果须另行记录，不能复用 c0bc6c3a 的旧失败证据。
- ICC 复审先复现无定义/下降曲线仍被接受（1失败、8通过），补充分段解析和 tag 白名单后9项通过；不为接受当前显示器配置增加连续性或像素误差预算。全目录类型检查仍失败，但本轮合成、色彩配置、采集与重放模块无新增诊断。
- `pnpm e2e:tailwind:contract`：118文件1898项通过；随后新增的曲线与 sRGB 格式拒绝回归先红后绿，最终三文件26项定向回归、定向 ESLint 和 `agents:check` 通过。48份 static 产物在 `CI=1` 下禁止更新比较通过。

### 修正后的真实微信重验

源码 `fc63c15c0cf8bfd300defd09608ff759722b0c59` 完成 fresh 扩展预检 `d08d956e-febe-419e-b6af-cbdce2a61cb9`；所有脚本、当前会话原生 Chrome 输入/点击/完成截图和 verify 均通过。新建的 Chrome 探针标签显式关闭，微信项目由原绑定服务清理，预检会话已消费关闭。

执行 `pnpm e2e:tailwind --preflight-report <d08d956e报告> --target weapp --case '^(alpha-|runtime-color-weight-limit$|dynamic-width$)'`，实际 run `ba15e516-56d9-4e52-b91a-1deb582a5fdd` 成功退出：14例、403条断言、83份原始附件。13例为应支持正向，其中11例静态权重、1例有限类切换和1例动态宽度；另1例为预声明平台限制的可执行负向回归。报告位于 `e2e/.artifacts/tailwind/<run-id>/weapp/report.json`，包含完整项目、20帧原始/裁剪 PNG、窗口尺寸与逐阶段回执。

独立进程再次调用生产 `verifyReportArtifacts` 和成功断言，83份附件、源项目、色彩配置、marker、阶段及原始像素全部重算通过，重放时间为 `2026-10-21T20:26:34.586Z`。实际审看50%红、原色透明度相乘、12.5%静态变量，以及正向类切换和未知权重负向的全部三阶段截图；主体、参考、独立校准、变量见证与阶段标记符合预声明结果。此前 `c0bc6c3a` 的9项失败保持原样，不能由本次成功覆盖。

## 适用边界

本轮保持验收 partial。合同、生成产物和合成协议通过不代表微信运行时通过，也不代表全部注册能力、RN/Lynx 原生及 Web 剩余状态已验收。


## 规则评估

既有“预声明支持预期”和“运行时重读 PNG/sidecar”规则已经覆盖本问题，无需增加放行例外。将微信真实采集接入同一生产重放器，并保留认证和清理原异常，避免合同测试与端侧判定分叉。
