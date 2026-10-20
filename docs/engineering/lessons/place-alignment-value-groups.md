---
status: partial
issue: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-place
baseline: 9cde871c46307a08f2e2c1403f556d8be521f862
regressions:
  - packages/postcss/test/place-properties.test.ts
  - e2e/tailwind-weapp-conversion-oracle.test.ts
---

# place 对齐值组与独立 WXSS 合同

## 症状

Tailwind 4.3.3 的 `place-content-center-safe`、`place-items-end-safe`、`place-self-center-safe` 等七个默认补全在真实内存 WXSS 转换中偏离独立 CSS Alignment 预期。依赖输出 `align-self:safe;justify-self:center`，其中 `safe` 不是完整对齐值。`place-content:baseline` 的 justify 缺省值也错误生成 baseline。

## 根因与纠正

实际依赖为 `postcss-preset-env@11.6.1` 中的 `postcss-place@11.0.1`。其实现把每个 word/function token 视为一个方向的值，只读取前两个，未按 [CSS Alignment](https://www.w3.org/TR/css-align-3/) 的 overflow-position、baseline-position 和 legacy 值组解析。变量替换可能提供两个值组，也不能当作单个方向值静态展开。

在 preset-env 已选中该插件的边界适配声明解析：完整消费两个合法值组，保留 safe/unsafe、first/last baseline 和 legacy 语义，content 基线省略第二值时使用 start。未知函数、变量、无效组合和属性后缀不展开；即使 preserve=false 也保留无法可靠转换的原声明。继续尊重显式功能关闭、全局 preserve 和功能级 preserve。

此修复不修改依赖文件或锁文件。上游只读检索未发现本值组问题的匹配修复；后续升级应使用持久回归检查，若上游完整覆盖这些边界即可移除此适配。

另发现 E2E 只为 PostCSS 根入口登记 source alias，但主包已消费 transform/syntax/plugin 子入口，导致本地源码修复未进入集成验证。补全三个精确子入口 alias，使真实生成器回归消费当前 checkout 源码。

独立 WXSS 合同由 literal-preservation-v1 升级为 keyword-compatibility-v2。新增静态语法先审查 W3C 语法及既定默认策略，单独冻结别名、回退及简写转换。848 / 23,286 个完整 completion 有合同；22,438 个缺口不推导为 unsupported，设备能力也不由编码通过推导。官方虽列出 justify-baseline，但 CSS Alignment 的 justify-content 不含 baseline，因此该候选保持语法合同缺口，不因声明被原样输出就判支持。

## 验证

2026-10-19 在 macOS 的本任务 worktree（上述 baseline 加未提交修复）执行定向测试，不启动设备或浏览器：

- 修复前 `place-properties.test.ts` 25 项中 18 项失败，覆盖分组、变量、无效值和属性精确匹配。
- 修复后包内 place、pipeline 与既有 gradient/hex fallback 回归共 53 项通过，覆盖上述边界、preserve/feature 及功能元组配置。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-weapp-conversion-oracle.test.ts --update=none`：108 项通过；其中先逐合同阻断丢声明反例，再真实转换全部 848 个有合同 completion，并核对 53 个独立任意属性示例。
- 严格类型检查保留包内既有诊断；本轮新模块和新增代码的诊断单独检查，不声明全包类型通过。`pnpm release status` 已识别中文 PostCSS patch intent，并解析依赖消费包。
- `pnpm --filter @weapp-tailwindcss/postcss build` 因借用依赖的 node_modules 为符号链接被 pnpm 12 拒绝；随后在包目录用 `pnpm exec` 顺序执行相同的 tsdown、声明生成与声明 alias 重写三步，均通过。重读本 worktree 的 ESM/CJS transform 产物，真实 handler 的 safe 对齐和 content 基线语义均通过。此记录不把声明生成的 noCheck 视为严格类型通过。

本轮未执行浏览器、微信 IDE 或原生宿主。static 产物由父任务统一重新生成并验收；没有该步骤的记录不能把本记录写成全面 E2E 通过。

## 适用边界

产品解析覆盖已知 CSS Alignment 关键字语法；未来新函数和新关键字保留原简写，等待专门语义合同。WXSS oracle 只覆盖单组 place 对齐，产品的双组解析另由包内回归验证。字面量保留与既定兼容改写分别核对，均不证明设备呈现。

## 规则评估

沿用现有独立 oracle、负责模块修复、失败回归和本地证据分层规则，不新增或放宽 AGENTS 规则。
