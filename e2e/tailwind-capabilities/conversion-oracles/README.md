# 已审查转换合同

`reviewedWeappOracles(candidates, officialReferenceCss)` 只接收隔离官方参考 CSS。它不导入产品 escape、PostCSS 转换器，也不接收本轮 WXSS，因此无法把本轮结果反推为预期。

当前 `weapp-literal-preservation-v1` 合同审查范围为：默认生成器配置、单类选择器、独立冻结的 ASCII 类名编码、无条件或 `print/screen/all` 媒体条件，以及 `properties.ts` 明确列出的字面量属性和值。默认不启用 rem2rpx，因此长度的值与单位必须完整保留；`!important`、声明顺序和全部条件也必须保留。任意一项未知则整个候选没有 oracle，不能仅对已知部分通过。

变量和全局初始化依赖、逻辑属性、复杂函数、现代颜色、媒体范围、supports/container、关系及状态选择器、前缀改写和极大圆角目前明确保留缺口。后续应按语法族审查规则、补独立反例，再扩大合同；不能从转换失败推导 unsupported，不能自动接受转换产物为基线。

`reviewedWeappOracleCoverage()` 返回候选去重后的合同覆盖及缺口原因。它不接收转换观察，也不输出通过率。`oracle.support: supported` 仅是 `encoding` 层的预期；编译器保留声明不证明小程序运行时或像素支持。

固定 Tailwind 4.3.3 的 23,286 个 completion 中，当前有 490 个完整候选属于本合同，22,796 个仍缺少独立转换合同。定向回归先从官方参考固定这些预期，再执行产品生成器的 `weapp` 转换，逐候选比较全部声明；另验证任意值、负值、小数、important、任意属性和 print 条件。该数字不能写成全注册表或全部平台通过。

接入时先编译官方参考并调用本构建器，将 `attempt.oracle` 同时传给 `conversionCaseContract` 和 `conversionCaseResult`；没有 oracle 的候选继续保留 `not-run`。声明预期必须在执行目标转换前固定，并随 fixture/expectations identity 记录。参考 CSS 与产物不得相互替代。

验证命令：`pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-weapp-conversion-oracle.test.ts --update=none`。此入口仅运行协议回归与纯内存编译，不启动浏览器或微信 IDE，也不代表设备 E2E 验收。
