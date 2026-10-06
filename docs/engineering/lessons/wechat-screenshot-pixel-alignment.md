---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: cba7f067d7a8c8a874ba78f403cdd2706a8e962e
regressions:
  - e2e/issue-928-css-pixel-region.test.ts
  - e2e/mini-program-screenshot.test.ts
  - e2e/issue-909-ide.test.ts
---

# 微信截图缩放与渐变基线

## 症状

完整扩展流程 `9db59b72` 前 28 阶段通过，第 29 阶段 #909 像素测试在裁剪前失败：原图 804×1428，运行时 375×667，宽度推算高度残差为 2.048 像素。此前模板 smoke 已分离原图证据，像素测试仍严格拒绝不确定几何。

## 根因与纠正

原生 UI 显示模拟器使用「自适应 107%」。稳定版截图先缩放模拟器，再对截图矩形向外取整并按宿主比例栅格化；公开结果只有图片。基础库的 `App.CDPCommand` 是有限协议适配，`Page.captureScreenshot` 不支持参数，仍走相同捕获路径，不能用 clip 或 layoutMetrics 绕过。未扩充 Tool 白名单或改 IDE 存储。

将本任务的固定项目显式设为 100% 后，原图恢复 750×1334，现有严格裁剪得到 750×1206。没有改变裁剪容差。几何错误现在报告具体尺寸及官方 UI 恢复步骤；该设置按完整项目路径保存，不声称对任意新建项目生效。

随后 #909/#916 的变换、颜色和原生选择器断言通过，#928 对照仍有 1781 个差异像素。独立审查确认旧基线逐字节等于历史 640×1236 视口按 390 CSS 像素宽采样的结果；两轮节点均为 112×56，对照区域均为 240×128。旧图的边框在采样前已有竖向偏移。所有超阈值差异位于边框/圆角邻域，四块渐变内部无超阈值差异。不能把非整数截图仅归一化尺寸后视作可靠像素基线。

#928 生成和比较基线前现在拒绝非整数采样比例，通用 CSS 坐标裁剪仍支持非整数密度。两个历史案例先复现缺少检查，再通过实现修复。限定重生成 v4 截图基线，记录本次环境，保留颜色、布局、`threshold: 0.1` 和差异像素 `< 10` 的原断言，不平移图片或自动配准。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-928-css-pixel-region.test.ts e2e/mini-program-screenshot.test.ts e2e/mini-program-full-screenshot.test.ts --update=none`：32 项通过；新增两个非整数比例案例在实现前均失败。
- 官方 UI 调整后首次真实回归保留 1781 像素失败，不以更新消除未解释问题。
- `CI=1 E2E_UPDATE_ISSUE_928_BASELINE=1 pnpm e2e:ide:issues-909-916-928 --update=none`：限定 v4 基线，两项通过；仅此更新流程写入图片。
- 取消更新变量后执行 `CI=1 pnpm e2e:ide:issues-909-916-928 --update=none`：两项通过、无跳过，30.04 秒；两份对照均为 0 差异像素，`compareBaselineUpdated: false`。两个阶段都重新构建，未跳过构建。
- 当前微信服务复查为 `login: true`、`serviceLocked: false`，本轮项目已关闭。原生 UI 还定向关闭了经归属核对的旧预检窗口和同实例并发探针两个窗口；未退出 IDE 或操作用户其他页面。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER=^taro-webpack-react-tailwindcss-v4$ pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts -u`：10 项通过，限定重生成 14 份 static 基线，版本库无差异。该变量只关闭 static 的 IDE 自动打开，不计设备验收。
- 上述 static 命令改为 `--update=none` 后复验：10 项通过、无跳过，13.01 秒；ESLint、`pnpm agents:check` 和 `git diff --check` 通过。
- 首次失败与 100% 定向截图存于 `e2e/.artifacts/wechat-zoom-probe/2026-10-05/`；完整流程首次失败保存在 `e2e/.artifacts/full-regression/9db59b72-bb73-4c0c-876f-89b3229ceb5a/`。

## 适用边界

当前项目实际基础库为 3.10.3，模板探针此前的 3.17.3 不能代替该读数。全部为稳定版 2.02.2608080 下的模拟器截图验收。整数比例只排除已知不可靠采集，不证明任意宿主 DPR、抗锯齿或引擎版本等价。此前[坐标空间复盘](gradient-screenshot-coordinate-space.md)的尺寸归一化仍适用，其对非整数密度像素一致性的解释需由本记录补充。

本次不改变 demo、CSS 编译或样式语义。完整 46 阶段尚未通过，旧完整报告不能代表后续提交；设备原生 HMR 和独立性能问题仍分别保留。

## 规则评估

不新增 AGENTS 硬规则。更新唯一多端手册、基线环境记录、错误诊断和持久回归，保留现有登录态保护与严格像素门槛。
