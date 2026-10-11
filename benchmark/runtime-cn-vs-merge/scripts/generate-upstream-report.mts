import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectEnv } from '../src/env'
import { benchPath, bundlePath, packageRoot, parityPath, upstreamReportPath } from '../src/paths'
import {
  indexBench,
  mdTable,
  ratio,
  readJson,
  type BenchFile,
  type BundleFile,
  type ParityFile,
} from '../src/report-format'
import type { CaseBench } from '../src/results'
import { formatBytes, formatNs, formatOps } from '../src/stats'

function pkgVersion(name: string) {
  const candidates = [
    join(packageRoot, 'node_modules', name, 'package.json'),
  ]
  for (const candidate of candidates) {
    try {
      return (JSON.parse(readFileSync(candidate, 'utf8')) as { version: string }).version
    }
    catch {
      continue
    }
  }
  return 'unknown'
}

function ops(map: Record<string, CaseBench> | undefined, id: string) {
  return map?.[id]?.steady.opsPerSecond ?? 0
}

function p50(map: Record<string, CaseBench> | undefined, id: string) {
  return map?.[id]?.steady.p50Ns ?? 0
}

function main() {
  const parity = readJson<ParityFile>(parityPath)
  const bundle = readJson<BundleFile>(bundlePath)
  const bench = readJson<BenchFile>(benchPath)
  const env = collectEnv()
  const cnVersion = pkgVersion('cn')
  const twVersion = pkgVersion('tailwind-merge')
  const clsxVersion = pkgVersion('clsx')

  const bySubject = indexBench(bench)

  const cn = bySubject['upstream-cn']
  const cnTw = bySubject['upstream-cn-twmerge']
  const tw = bySubject['upstream-twmerge']
  const twClsx = bySubject['upstream-twmerge-clsx']
  const caseIds = bench.subjects.find(item => item.subjectId === 'upstream-cn')?.cases.map(item => item.id) ?? []

  const dropInRows = caseIds.map((id) => {
    const cnOps = ops(cn, id)
    const twOps = ops(twClsx, id)
    const faster = cnOps === twOps ? '持平' : cnOps > twOps ? 'cn()' : 'twMerge(clsx)'
    const parityCase = parity.cases.find(item => item.id === id)
    return [
      id,
      formatOps(cnOps),
      formatOps(twOps),
      formatNs(p50(cn, id)),
      formatNs(p50(twClsx, id)),
      ratio(cnOps, twOps),
      faster,
      parityCase ? (parityCase.upstreamEqual ? '相同' : '**不同**') : '—',
    ]
  })

  const mergeOnlyRows = caseIds.map((id) => {
    const cnOps = ops(cnTw, id)
    const twOps = ops(tw, id)
    const faster = cnOps === twOps ? '持平' : cnOps > twOps ? 'cn.twMerge' : 'twMerge'
    return [
      id,
      formatOps(cnOps),
      formatOps(twOps),
      formatNs(p50(cnTw, id)),
      formatNs(p50(tw, id)),
      ratio(cnOps, twOps),
      faster,
    ]
  })

  const claimed = [
    ['the call your components make most', '320 ns', '10 ns', '30×', 'component-call'],
    ['same classes as last render (cache hit)', '14 ns', '7 ns', '1.9×', 'cache-hit / component-call'],
    ['typical component strings, warm', '13 ns', '7 ns', '1.9×', 'last-wins / short-no-conflict'],
    ['thousands of recurring strings', '2.4 µs', '14 ns', '172×', 'working-set'],
    ['cold render, many arbitrary values', '3.4 µs', '1.1 µs', '3.0×', 'arbitrary-heavy + cache-miss 形态'],
    ['cold render, SSR-style unique strings', '2.3 µs', '360 ns', '6.4×', 'cache-miss'],
    ['very first call (page load)', '3.2 ms', '0.4 ms', '7×', '进程内第一条 case 的 coldStart'],
  ]

  const highlightIds = ['component-call', 'component-call-fresh', 'cache-hit', 'working-set', 'cache-miss', 'long-list', 'arbitrary-heavy', 'last-wins']
  const highlight = highlightIds.map((id) => {
    const cnOps = ops(cn, id)
    const twOps = ops(twClsx, id)
    return `- \`${id}\`：cn() ${formatOps(cnOps)} / ${formatNs(p50(cn, id))}，twMerge(clsx) ${formatOps(twOps)} / ${formatNs(p50(twClsx, id))}，cn 相对倍数 ${ratio(cnOps, twOps)}。`
  })

  const bundleRows = bundle.results
    .filter(item => item.id.startsWith('upstream-'))
    .map(item => [item.label, formatBytes(item.rawBytes), formatBytes(item.gzipBytes), formatBytes(item.brotliBytes)])

  const mismatches = parity.summary.upstreamMismatches
  const mergeMismatches = parity.summary.upstreamMergeMismatches ?? []

  const report = [
    '# 上游 `cn` vs `tailwind-merge` 性能报告',
    '',
    '这份报告只比较 npm 上的 `cn` 和 `tailwind-merge`，**不含** `@weapp-tailwindcss/*` 的 escape / rpx 包装。可以单独阅读。weapp 包装后的对比见 [`performance-report.md`](./performance-report.md)。',
    '',
    '数字全部来自本目录脚本的本机实测。不用 `cn` README 的 30× / 37× / 172× 当结论。',
    '',
    '## 结论摘要',
    '',
    `- 版本：\`cn@${cnVersion}\`，\`tailwind-merge@${twVersion}\`，\`clsx@${clsxVersion}\`。`,
    `- 对标他们宣传的 drop-in：\`cn()\` vs \`twMerge(clsx(...))\`。`,
    `- 参数引用稳定的组件调用 \`component-call\`：cn 相对倍数 ${ratio(ops(cn, 'component-call'), ops(twClsx, 'component-call'))}。`,
    `- 每次新建参数数组 \`component-call-fresh\`：${ratio(ops(cn, 'component-call-fresh'), ops(twClsx, 'component-call-fresh'))}。`,
    `- 64 组工作集循环 \`working-set\`：${ratio(ops(cn, 'working-set'), ops(twClsx, 'working-set'))}。`,
    `- 每次唯一字符串 \`cache-miss\`：${ratio(ops(cn, 'cache-miss'), ops(twClsx, 'cache-miss'))}。这条上更快的一方不一定是 cn。`,
    `- 长列表且参数引用稳定 \`long-list\`：${ratio(ops(cn, 'long-list'), ops(twClsx, 'long-list'))}。`,
    `- 语义：\`cn()\` vs \`twMerge(clsx)\` 不一致 ${mismatches.length === 0 ? '无' : mismatches.map(id => `\`${id}\``).join('、')}；\`cn.twMerge\` vs \`twMerge\` 不一致 ${mergeMismatches.length === 0 ? '无' : mergeMismatches.map(id => `\`${id}\``).join('、')}。`,
    '',
    '宣传里的 30× 来自「相同字符串实例 + 调用序列预测」，不是任意 class 合并都快 30 倍。唯一输入时优势会消失，有时还会更慢。',
    '',
    '## 环境',
    '',
    `- 时间：${bench.env.timestamp}`,
    `- Commit：\`${bench.env.commit}\``,
    `- Node：${bench.env.node}`,
    `- OS：${bench.env.platform} ${bench.env.release} (${bench.env.arch})`,
    `- CPU：${bench.env.cpu}`,
    `- 内存：${formatBytes(bench.env.totalMemoryBytes)}`,
    '',
    '## 他们怎么宣称',
    '',
    '[cn README](https://github.com/shadcn-ui/cn) 写的是 drop-in 替换 `clsx` + `tailwind-merge`，并且 [30× faster](https://github.com/shadcn-ui/cn#how-much-faster)。[how-it-works](https://github.com/shadcn-ui/cn/blob/main/docs/how-it-works.md) 把 30× 解释成：',
    '',
    '1. 冲突规则编译成 typed array 表，运行时不再走 config / regex / Map trie。',
    '2. **Argument cache**：组件反复传入同一批字符串实例时，指针比较后直接返回。',
    '3. **调用序列预测**：render loop 里连 lookup 都跳过，大约 10 ns。',
    '4. 字符串要出现两次才进 whole-string cache，一次性 SSR 字符串不污染缓存。',
    '',
    '他们公布的表（不是本机数字）：',
    '',
    mdTable(
      ['他们的 scenario', 'clsx + tailwind-merge', 'cn', '宣称倍数', '本报告对应 case'],
      claimed,
    ),
    '',
    '方法差异：他们每个实现 × 负载单独子进程、warmup、取 5 次 timed block 的最好成绩。我们是每个实现一个子进程，跑完全部 case；warmup 300 次后采 400 个稳态样本（每样本 25 次调用的平均）。绝对值不能和他们那张表逐 ns 对齐，看相对倍数和「什么负载快」。',
    '',
    '## 受试者',
    '',
    mdTable(
      ['id', '调用', '对标'],
      [
        ['upstream-cn', '`cn()`', '他们推荐的 drop-in'],
        ['upstream-cn-twmerge', '`cn.twMerge()`', '只合并，不含 clsx 风格对象'],
        ['upstream-twmerge', '`twMerge()`', 'tailwind-merge 本体'],
        ['upstream-twmerge-clsx', '`twMerge(clsx(...))`', '今天大多数项目的写法'],
      ],
    ),
    '',
    '## 体积（esbuild minify，含传递依赖）',
    '',
    mdTable(['受试者', 'raw', 'gzip9', 'brotli'], bundleRows),
    '',
    '## 主对比：`cn()` vs `twMerge(clsx(...))`',
    '',
    '`cn/twMerge(clsx)` > 1 表示 cn 更快。',
    '',
    mdTable(
      ['Case', 'cn() ops/s', 'twMerge(clsx) ops/s', 'cn p50', 'tw p50', 'cn/tw', '较快', '输出'],
      dropInRows,
    ),
    '',
    '## 合并本体：`cn.twMerge` vs `twMerge`',
    '',
    '去掉 clsx，只比冲突合并。',
    '',
    mdTable(
      ['Case', 'cn.twMerge ops/s', 'twMerge ops/s', 'cn p50', 'tw p50', 'cn/tw', '较快'],
      mergeOnlyRows,
    ),
    '',
    '## 和宣传口径对齐的几行',
    '',
    ...highlight,
    '',
    '## 怎么读',
    '',
    '- `component-call` 复用同一参数数组，最接近他们说的「组件每次 render 传入同一批字符串实例」。这条上 cn 应该明显更快。',
    '- `component-call-fresh` 每次 `() => [base, variant, extra]` 新建数组。字符串字面量仍然 intern，但数组身份变了。若 30× 主要靠 argument identity / 序列预测，这里倍数会掉下来。',
    '- `working-set` 在 64 组预先分配好的参数之间循环，对应「真实仓库的工作集」。',
    '- `cache-miss` 每次拼新字符串，对应 SSR / 动态 class。whole-string cache 帮不上忙。',
    '- `long-list` 参数引用稳定时，cn 可能把整次合并变成一次缓存命中，倍数会非常大；这测的是缓存，不是「合并 30 个 utility 的算法」。',
    '- 每个受试者进程的第一条 case 冷启动包含引擎初始化。`tailwind-merge` 第一次建 trie 更贵，和他们「首调用 3.2 ms vs 0.4 ms」是同一类现象，但我们的绝对值会因为 harness 不同而变。',
    '',
    `生成时间：${env.timestamp}`,
    '',
  ].join('\n')

  writeFileSync(upstreamReportPath, `${report}\n`)
  console.log(`wrote ${upstreamReportPath}`)
}

main()
