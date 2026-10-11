import { collectEnv } from './env'
import {
  envBlock,
  mdTable,
  mismatchList,
  ratio,
  type BenchFile,
  type BundleFile,
  type ParityFile,
} from './report-format'
import { formatBytes, formatNs, formatOps } from './stats'
import { WEAPP_SUBJECTS, type SubjectId } from './subjects'
import type { CaseBench } from './results'

export function renderWeappPerformanceReport(
  parity: ParityFile,
  bundle: BundleFile,
  bench: BenchFile,
  benchBySubject: Record<SubjectId, Record<string, CaseBench>>,
) {
  const env = collectEnv()
  const caseIds = bench.subjects[0]?.cases.map(item => item.id) ?? []
  const primaryCases = caseIds.filter(id => id !== 'cache-hit' && id !== 'cache-miss')
  const speedRows = primaryCases.map((caseId) => {
    const cnRow = benchBySubject['weapp-cn']?.[caseId]
    const mergeRow = benchBySubject['weapp-merge']?.[caseId]
    const parityCase = parity.cases.find(item => item.id === caseId)
    const mismatch = parityCase ? !parityCase.weappCnVsMerge : false
    const cnOps = cnRow?.steady.opsPerSecond ?? 0
    const mergeOps = mergeRow?.steady.opsPerSecond ?? 0
    const faster = cnOps === mergeOps ? '持平' : cnOps > mergeOps ? 'cn' : 'merge'
    return [
      caseId,
      cnRow ? formatOps(cnOps) : 'n/a',
      mergeRow ? formatOps(mergeOps) : 'n/a',
      cnRow ? formatNs(cnRow.steady.p50Ns) : 'n/a',
      mergeRow ? formatNs(mergeRow.steady.p50Ns) : 'n/a',
      cnRow ? formatNs(cnRow.steady.p95Ns) : 'n/a',
      mergeRow ? formatNs(mergeRow.steady.p95Ns) : 'n/a',
      cnOps > 0 && mergeOps > 0 ? ratio(mergeOps, cnOps) : 'n/a',
      faster,
      mismatch ? '输出不同' : '相同',
    ]
  })

  const subjectCells = (caseId: string, format: (row: CaseBench) => string) =>
    WEAPP_SUBJECTS.map((subject) => {
      const row = benchBySubject[subject.id]?.[caseId]
      return row ? format(row) : 'n/a'
    })

  const cnLastWins = benchBySubject['weapp-cn']?.['last-wins']?.steady.opsPerSecond ?? 0
  const mergeLastWins = benchBySubject['weapp-merge']?.['last-wins']?.steady.opsPerSecond ?? 0
  const cnHit = benchBySubject['weapp-cn']?.['cache-hit']?.steady.opsPerSecond ?? 0
  const mergeHit = benchBySubject['weapp-merge']?.['cache-hit']?.steady.opsPerSecond ?? 0
  const cnMiss = benchBySubject['weapp-cn']?.['cache-miss']?.steady.opsPerSecond ?? 0
  const mergeMiss = benchBySubject['weapp-merge']?.['cache-miss']?.steady.opsPerSecond ?? 0
  const cnBundle = bundle.results.find(item => item.id === 'weapp-cn')
  const mergeBundle = bundle.results.find(item => item.id === 'weapp-merge')

  return [
    '# `@weapp-tailwindcss/cn` vs `@weapp-tailwindcss/merge` 性能报告',
    '',
    '这份报告可以单独阅读，不依赖对比报告。这里只比 weapp 包装后的 `cn` / `merge`。上游 npm `cn` 对 `tailwind-merge` 的宣称倍数见 [`upstream-cn-vs-tailwind-merge.md`](./upstream-cn-vs-tailwind-merge.md)。数字全部来自本机实测。',
    '',
    '## 结论摘要',
    '',
    `- last-wins 稳态：\`cn\` ${formatOps(cnLastWins)}，\`merge\` ${formatOps(mergeLastWins)}（merge/cn = ${cnLastWins > 0 && mergeLastWins > 0 ? ratio(mergeLastWins, cnLastWins) : 'n/a'}）。`,
    `- cache-hit：\`cn\` ${formatOps(cnHit)}，\`merge\` ${formatOps(mergeHit)}。`,
    `- cache-miss：\`cn\` ${formatOps(cnMiss)}，\`merge\` ${formatOps(mergeMiss)}。`,
    `- 消费者 minify gzip：\`cn\` ${cnBundle ? formatBytes(cnBundle.gzipBytes) : 'n/a'}，\`merge\` ${mergeBundle ? formatBytes(mergeBundle.gzipBytes) : 'n/a'}。`,
    `- 语义：\`cn\` 与 \`merge\` 不一致的静态 case 为 ${mismatchList(parity.summary.weappCnVsMergeMismatches)}。输出不同的行不能只按速度排名。`,
    '',
    '## 环境',
    '',
    envBlock(bench.env),
    '',
    '## 方法',
    '',
    '- 每个受试者在**独立 Node 子进程**中加载，避免 JIT 和缓存互相污染。',
    '- 子进程启用 `--expose-gc`。',
    '- 先测冷启动（import 后第一次调用），再 warmup 300 次，然后采集 400 个稳态样本；每个样本是 25 次调用的平均耗时。',
    '- 延迟用 `process.hrtime.bigint()`，ops/s 由稳态中位数换算。',
    '- 内存：`cache-hit` / `cache-miss` / `long-list` 在 GC 后各跑 8000 次，看 `heapUsed` 增量。',
    '- 体积：esbuild `bundle + minify`，再 gzip9 / brotli。工作目录是本 package，以便解析 workspace 依赖。',
    '- `lite` 只 join，不参与「谁合并得更快」的结论。',
    '',
    '### 受试者',
    '',
    mdTable(
      ['id', '实现', 'escape', '冲突合并'],
      WEAPP_SUBJECTS.map(item => [
        item.id,
        item.label,
        item.escaped ? '是' : '否',
        item.joinOnly ? '否（join）' : '是',
      ]),
    ),
    '',
    '## 体积',
    '',
    mdTable(
      ['受试者', 'raw', 'gzip9', 'brotli'],
      bundle.results.map(item => [
        item.label,
        formatBytes(item.rawBytes),
        formatBytes(item.gzipBytes),
        formatBytes(item.brotliBytes),
      ]),
    ),
    '',
    '## 主对比：weapp-cn vs weapp-merge',
    '',
    '`merge/cn` > 1 表示 merge 更快。`输出` 列来自同一套静态对拍。',
    '',
    mdTable(
      ['Case', 'cn ops/s', 'merge ops/s', 'cn p50', 'merge p50', 'cn p95', 'merge p95', 'merge/cn', '较快', '输出'],
      speedRows,
    ),
    '',
    '## 全受试者吞吐',
    '',
    mdTable(
      ['Case', ...WEAPP_SUBJECTS.map(item => item.id)],
      caseIds.map(caseId => [caseId, ...subjectCells(caseId, row => formatOps(row.steady.opsPerSecond))]),
    ),
    '',
    '## 冷启动（第一次调用）',
    '',
    mdTable(
      ['Case', ...WEAPP_SUBJECTS.map(item => item.id)],
      caseIds.map(caseId => [caseId, ...subjectCells(caseId, row => formatNs(row.coldStartNs))]),
    ),
    '',
    '## 缓存与内存',
    '',
    mdTable(
      ['Case', ...WEAPP_SUBJECTS.map(item => item.id)],
      ['cache-hit', 'cache-miss', 'working-set'].map(caseId => [
        caseId,
        ...subjectCells(caseId, row => formatOps(row.steady.opsPerSecond)),
      ]),
    ),
    '',
    'heapUsed 增量（8000 次调用后，负值表示 GC 后堆变小）：',
    '',
    mdTable(
      ['Case', ...WEAPP_SUBJECTS.map(item => item.id)],
      ['cache-hit', 'cache-miss', 'long-list', 'working-set'].map(caseId => [
        caseId,
        ...WEAPP_SUBJECTS.map((subject) => {
          const row = benchBySubject[subject.id]?.[caseId]
          return row?.heapDeltaBytes == null ? 'n/a' : formatBytes(row.heapDeltaBytes)
        }),
      ]),
    ),
    '',
    '## 如何阅读这些数字',
    '',
    '- 每个受试者进程的**第一条 case**（本矩阵是 `short-no-conflict`）包含引擎初始化，冷启动会明显偏大；后面的 case 才是「函数已热」的第一次调用。',
    '- 命中缓存时 `merge` 外层 LRU 让稳态更快；唯一输入的 `cache-miss` 上 `cn` 通常更快，因为它没有 rpx prepare/restore，引擎表查找比 `tailwind-merge` 配置图更轻。',
    '- 上游 `cn` 在命中路径可以到数千万 ops/s，weapp `cn` 慢一截主要是每次 escape/unescape。这是小程序兼容成本，不是引擎退化。',
    '- gzip 后默认 `merge` 可能略小于 `cn`：`tailwind-merge` 压缩率更好，`cn` 的编译表 + engine 压缩后不一定更小。',
    '- `lite` 只 join，不参与「谁合并得更快」。',
    '- 本机结果不能当 CI 门禁；相对顺序比绝对值更有参考价值。',
    '',
    `生成时间：${env.timestamp}`,
    '',
  ].join('\n')
}
