---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: f841a7582e523d516edbe57fa75670d967ccd37d
regressions:
  - examples/react-lynx/src/components/CaseCard.test.ts
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - e2e/lynx-rspeedy.test.ts
  - e2e/lynx-structural.test.ts
  - e2e/lynx-pixel-evidence.test.ts
---

## 症状

`first:font-bold odd:opacity-50` 放在普通 view 上，内部只有一个文字节点及两个装饰 view；既没有直接消费字重，也没有同时观察首项、偶数项、第三项。图片不同不足以证明两个选择器按正确位置生效。

先补真实兄弟节点回归，在原实现复现 `expected length 3, received 1`。保留原生支持基线，不把旧夹具的不支持结论当作 SDK 能力证据。

## 根因与纠正

- 使用三个同内容的兄弟 text，直接消费被测 utility，固定字体、行高、位置和同步绘制。首项应为粗体与半透明，第二项均不命中，第三项只命中半透明。
- 同轮保存 probe、普通文字 control 和显式效果 reference 三张完整画布。reference 使用直接字重与透明度声明，独立于被测伪类；不向 SDK 注入选择器替代实现。
- 宿主先确认 control 的三个普通字形一致，再验证 reference 的粗体与半透明确实可观察，最后逐项匹配 probe。缺图、透明画布、坏对照阻断取证；有效对照下未产生目标效果才记为不支持。
- 审查发现仅校验 reference 首项墨色总量和透明度仍不充分：probe/reference 首项同步横移 8px 可以假通过。该反例先在初版验证器失败，随后补相对普通文字的中心、尺寸和双向笔画邻域校验；不能靠彼此一致自证对照有效。后续又复现两个首项同时放大 17/16 的假阳性，补充按字形面积归一的笔画密度检查及实际浏览器 32px→34px 的反例。
- 三帧清单由采集和校验共用，原始报告只能提交待判定状态；最终报告必须与原始三帧重算一致。旧两帧 checkpoint、伪造支持、删除 reference、损坏 control/reference 均被拒绝。

## 验证

- `CI=1 pnpm e2e:lynx`：114 个示例测试、164 个构建和证据测试通过，无跳过。真实 CaseCard 和 encoder CSS 在 DPR 1、2.625、3 下验证三个位置；分别删除 utility、错误地让所有兄弟获得首项效果均失败。
- `CI=1 pnpm e2e:lynx:static:update` 仅更新 React Lynx 项目；118 项生成/编码结论和共享 catalog hash 不变，只有时间戳变化。之后完整定向 `e2e:lynx` 不更新验证通过。
- 后续验证器修正：17 项结构像素测试、23 项实际构建测试、34 项像素报告测试与 23 项完整证据测试通过。没有修改 demo 或 CSS 源码，因此复用本次已审查的 static。
- 示例 TypeScript、变更文件 ESLint、Stylelint 通过。复盘写入后执行 `pnpm agents:check` 与 `git diff --check`。

## 适用边界

固定 SDK 为 Lynx 4.0.1。此处浏览器只证明 fixture 正确，不替代两端原生采样。更新后的报告需 27 项几何证据及 60 张 PNG；原生支持基线尚未更新。颜色、字形与位置容差用于原生物理像素取整，不改写或重采样证据图。三帧证明的是同一宿主上 utility 在正确位置与显式字重/透明度声明的效果一致。笔画密度是固定文字夹具的辅助一致性检查，不是跨字体的字重识别器；不同字体的粗体字高也可能改变，不能用固定一像素字高差代替实际效果。独立证明平台字体属性仍需字体属性探针或固定字体 oracle，本轮不作该声称。

## 规则评估

不新增 AGENTS 规则。现有真实消费节点、对照和证据要求已覆盖本问题，使用持久回归落实。
