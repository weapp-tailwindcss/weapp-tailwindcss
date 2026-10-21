---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/postcss/test/cache-capacity.test.ts
  - packages/postcss/test/root-cache.test.ts
  - packages/postcss/test/css-source-trace-cache.test.ts
verification:
  - claim: 八个独立端点中三个 StyleHandler LRU 的条目分布、归属 AST 数量和 Input 数量一致
    kind: integration
    status: passed
    sha: 8db895c54373e20737dcc8254861f73872579aa1
    environment: macOS arm64、Node 22.23.3；隔离 git archive、frozen lockfile；每个角色和回滚数一个独立进程，仅诊断
    command: node .tmp/analyze-mpx-retained-run.mjs <本轮八点采集目录>
    reason: 统一冻结分析器验证原始快照与回执摘要；仅为选定对象的数量和浅大小，不是 RSS、完整 retained size 或显著性结论。
  - claim: 后续准确 head 的 Mpx 性能分片在原 5% 阈值下通过
    kind: ci
    status: passed
    sha: fe71c1d8c8e7e6d5ffde4e1748369c8e5d11da50
    environment: GitHub hosted Linux、Node 22；实际 current 为 merge 945b55667517fa5c994175c62b101e0b6046ab4d，base 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39675741360/job/119488963542
    reason: 单次新成功不证明旧 head 超额的根因已消除；其他检查与全面验收另行判定。
---

# Mpx 缓存保留对象诊断

## 症状

失败 head `8db895c54373e20737dcc8254861f73872579aa1` 的 run39654711780、job119415434589 中，Mpx 插件 HMR median230→258ms（+12.17%），peak RSS +18.03%，steady RSS +34.42%，未满足原5%门槛。每侧 RSS 来自一个 watch 会话，不能称三次独立显著性，也不能直接归因为 AST 泄漏。旧失败保留，没有重跑该作业或放宽阈值。

## 根因与纠正

此前累计 allocation 采样不能证明对象仍被保留。本次分别从准确 base `7d80eb1…` 和失败 head `8db895c…` 的隔离源码、各自 frozen lockfile 构建，在 ready 和完成1/2/3次修改及回滚的端点各启动一个独立进程，每个进程只采一次 heap snapshot，不显式调用 GC。八点使用同一 preload 和冻结分析器；[摘要与八份原件 hash](evidence/mpx-retained-8db.json)保留版本、源码/锁文件、快照/回执、捕获 epoch 和 D/G。

采集握手检查本轮 arm/commit、source SHA、watchRun 输入、产物 marker 集合和 completed/idle 边界。旧源码或旧 marker 的自然过渡编译单独归档，不主动追加编译碰运气。快照完成立即记录捕获边界，后续独立流式文件校验时的 compiler 状态另记。短写、文件长度和两端摘要均核验；源码还原后只清理本次进程组。

早期四次采集的旧 epoch、macOS退出瞬间EPERM、过渡产物与校验期间自然编译失败均保留。最终批次也保留最初清理EPERM；独立确认该进程组已无成员、源码恢复后，仅续采尚未取得的五点，没有重采三个已成功点。诊断脚本及原始大文件仍在本任务临时工件中，尚未产品化成通用 heap 工具；本记录不能替代持久产品回归。

## 验证

八点均识别3个CSS结果LRU，live Map key与occupied槽双射通过，entry分布均为`[0,3,8]`。所有缓存归属AST做union去重后均1691节点，Input均11个。AST shallow bytes除base回滚2、current回滚3为138080外，其余130144；7936差额恰为467个Rule和29个AtRule各16字节，只记录该现象，尚未证明对象布局变化的原因。

选定entry source/result.css/key/options及Input字符串backing的去重浅大小：

| 端点 | base bytes | current bytes | D=current−base | G=(current−current ready)−(base−base ready) |
| --- | ---: | ---: | ---: | ---: |
| ready | 729360 | 728432 | -928 | 0 |
| 回滚1 | 1119232 | 1118688 | -544 | 384 |
| 回滚2 | 1119232 | 1118688 | -544 | 384 |
| 回滚3 | 1119232 | 1118688 | -544 | 384 |

这些端点未观察到所选缓存的AST、Input数量持续累积；两侧所选字符串浅大小在回滚1之后不再增长。不能据此排除其他对象、native分配或长期增长。

新head `fe71c1d8…` 的独立CI分片通过：HMR插件median297→295ms（−0.67%），peak RSS2066.29→2108.32MB（+2.03%），steady1925.25→1863.29MB（−3.22%），blocking guard、5%阈值、0violations。工件12381869129的ZIP SHA256独立重算为`469040198c951da14a9d05db4fc50e768f937623833776b53541c7025c00f3a8`，与上传digest一致。实际current为上述merge源码，不能写成直接checkout PR head；没有调度远端重跑。

## 适用边界

- 每点单样本且为不同进程，G不是同进程生存轨迹、逐编译增长或统计显著性；base/current回滚3的捕获epoch分别11/9。
- 只比较缓存条目分布，没有跨进程owner或node ID对应。仅沿AST `.nodes`和已选择的字段计数量/浅大小，强引用可达路径不是dominator retained size。
- 字符串入口本次没有entry.root输入语义快照，snapshotObjects全0不能评价Root入口。11个Input中8个CSS显示不完整，展示前缀hash不能用于证明完整CSS内容相同。
- snapshot可能触发GC并扰动执行。base回滚1捕获epoch5，独立文件校验后epoch11，before/after内存不能当作快照同时点对账。
- ready的native self_size约6.4GB尚未归因，与external/ArrayBuffer同阶不等于RSS，也没有native owner分解；其他独立进程端点约12MB不能画成释放曲线。
- 首次耗时/RSS超额仍未定位到负责模块。没有因假设而新增产品性能补丁；后续单次CI成功及这批本机诊断均不证明旧失败根因消除。总体验收保持partial。

## 规则评估

使用既有失败保留、准确提交和独立证据规则，不新增AGENTS、不新增发布intent。

Refs #1307, #1308, #1309


## 2026-10-22 当前源码公开facade与CPU对照诊断

在干净 `c0fce85fd52f554cccec41c472fe40fc639c69ea` 上仅执行一次本机诊断build（不是正式性能样本），公开Webpack facade、cssMatcher、SUMMARIZE tap与selector parser按正常模块加载之后插桩。8份CSS资产、原输入/输出hash及10份CPU profile完整保存，无截断，exit0。run `830b87e3-116c-4b70-af88-45766bd205df`，原件与分析在 `.tmp/mpx-trace/`、`.tmp/mpx-trace-analysis.log`。

共5个annotate frame、166规则、159个唯一selector；159miss/7hit，0重复解析selector。完整ASCII单class/list规则132。parser同步累计0.939ms，trace累计3.417ms，且每个outputHash均绑定实际after-plugin资产。主线程profile窗6891.917ms中，annotate inclusive3.583ms/7samples（0.052%），collector inclusive1.583ms/5samples；parser7.x总27.665ms包含加载与其它转换，不能全算给trace。parser6.x来自Mpx style-helper/cssnano。9个worker均为Terser，无trace/parser6/7调用；最忙两个窗口498.792ms/552.835ms有重叠，不能相加。

锁文件hash `765ed2e2f10b3dd7a35570987f36be5edc687bc243f1b0bf613f5111cae279cb`，readerHash `4360413daf59947736c33eb52f65b085bfad7809206293608f04fa84eb42f59f`，主线程profile hash `17bb34f85cd50710a6918fd2876f6e5bcba230c91ee9202404d1aa8efa716464`。该证据不支持把full-selector reader猜作热点并优化。

本机为macOS/Node24.18.0的单current插桩诊断；原失败是Linux/Node22.23.3、base10672.6229ms→current11266.745728ms（+594.1ms/+5.5668%），plugin602→655ms。缺同环境base profile，因此不能解释或撤销原5%门槛失败，也不能将其归为宿主噪声。没有重跑原作业或放宽阈值。
