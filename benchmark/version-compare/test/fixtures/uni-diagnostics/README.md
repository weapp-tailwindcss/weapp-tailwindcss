# Uni 首败的操作形状

`operation-shape.json` 来自 workflow run `40737453562`、head `9530a978c1d791ef2cb89d0e312bb644f53ea217` 的 base HMR 完整前五个 bundle。两侧这些实际调用与分支同形；首轮37个原始资产，后续每轮22个。第六/七轮复用已完整记录的第四/五轮修改/回滚拓扑，明确属于预算外推，不能声称该首败 run 完成了三轮。

`names` 与 `shapes` 保存实际调用名称、资产、源码模块、cache状态、plan名称及早退条件。每行依次是名称索引、形状索引、原 details JSON UTF-8 字节数、原调用身份；完整 payload 用等量换行保守填充。原始资产使用实际字节长度生成独立测试文本。`referenceEncodedBytes` 包含该片段实际 operation 文件及引用全文文件的编码字节，各片段重复引用也重复计数；回归额外补足该存储量。它验证协议容量与分支形状，不证明真实源码输入相等或真实性能通过。

`shutdownTail` 来自同次 base 冷构建实际 bundle.success 之后的全部98个关闭事件，作为七bundle watcher 的保守尾部储备。generic、runtime、plan、selection、cache 均保留真实条数；仅 Uni phase 的 start/success 合成一个完整 span。总计3748个事件，距4096余348个；字节和超限反例由回归实时断言，不提高任何预算。
