import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { measure } from './measure.mjs'
import { prepare } from './prepare.mjs'
import { assertProcessesStopped, failureEvidence, processOwnership } from './owned-process.mjs'

export const runOrder = [
  ['current', 1], ['previous', 1],
  ['previous', 2], ['current', 2],
  ['current', 3], ['previous', 3],
]

export function markdownReport(preparation, runs) {
  const lines = [
    `# ${preparation.label}`, '',
    '本轮比较 Webpack 编译器及明确记录的可选 esbuild peer 上下文，保持正式预算、依赖目标与完整编译工作量。结果仅作为诊断证据。', '',
    `源码：\`${preparation.sourceRef}\`；旧编译器配套来源：\`${preparation.baselineRef}\`。`,
    '两侧均为 Taro 4.3.1、当前源码、相同生产压缩配置；每侧三次新进程完整冷构建。',
    '两侧均使用派生锁，原正式锁及其 SHA 单独归档。明确的附加轴为可选编译器的 Terser 5.6.1/esbuild 0.21.5 上下文合入 esbuild 0.28.2；Terser 其余实现与绑定保持。',
    '仅准确 bunyan 4.0.1 的历史 engine 遗漏采用独立、对称的工具 metadata 参考；官方原响应、同 SRI tarball 与实际固定 Node 兼容收据另存，其它 metadata 和锁图审查保持严格。',
    '每个 main/child/worker 必须有加载守卫证据；实际加载 webpack-cli 或从 Terser 实现消费 esbuild、以及守卫缺证均使该轮测量无效。',
    '自然 GC 只记录运行时事件；没有主动 GC。worker_threads 的 RSS 属于主 Node，另记录线程创建数及峰值。',
    '逐资产完整 SHA256 来自 source.source()；phase 内存在求值/哈希前记录，哈希耗时及之后内存另存。此操作可能物化缓存源码，因此仅用于对称诊断。',
    'map 数量仅指实际 .map 资产与 related.sourceMap 元数据；不调用 source.map() 物化内部映射。', '',
    '| 编译器 | 轮次 | 主 Node 峰值 MiB | 进程树峰值 MiB | worker 创建/峰值 | 自然 GC 事件 | 产物数量/字节 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const run of runs) {
    const version = preparation.identities[run.role].webpack.version
    lines.push(`| ${version} | ${run.run} | ${run.mainNodePeakRssMb.toFixed(2)} | ${run.treePeakRssMb.toFixed(2)} | ${run.workers.created}/${run.workers.peak} | ${run.naturalGcEvents} | ${run.outputFiles}/${run.outputBytes} |`)
  }
  lines.push('', '| 编译器/轮次/compilation | 阶段 | RSS MiB | heapUsed MiB | external MiB | 资产数/字节 | map/related map | 哈希耗时 ms |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const run of runs) {
    for (const phase of run.phases) {
      lines.push(`| ${preparation.identities[run.role].webpack.version}/${run.run}/${phase.number} | ${phase.phase} | ${(phase.memory.rss / 2 ** 20).toFixed(2)} | ${(phase.memory.heapUsed / 2 ** 20).toFixed(2)} | ${(phase.memory.external / 2 ** 20).toFixed(2)} | ${phase.assetCount}/${phase.bytes} | ${phase.mapAssetCount}/${phase.relatedSourceMapCount} | ${phase.evidenceCostMs.toFixed(2)} |`)
    }
  }
  lines.push('', '实际 mainFields、options、压缩器身份、配套版本/补丁、全部资产 hash、锁差异闭包及 peer key 变化见 JSON/NDJSON artifact。', '')
  return lines.join('\n')
}

export async function main() {
  assert.equal(process.platform, 'linux', '该诊断固定 Linux；其他平台只运行纯 fixture 回归')
  assert.equal(process.version, 'v22.23.4', '诊断必须固定 Node 22.23.4')
  assert.ok(!process.env.NODE_OPTIONS, '拒绝未登记的 NODE_OPTIONS')
  assert.ok(!process.execArgv.some(arg => /gc|inspect|prof/i.test(arg)), '拒绝主动 GC、inspector 或 profiler 参数')
  const argument = process.argv.indexOf('--out-dir')
  const outDir = path.resolve(argument < 0 ? '.tmp/taro-compiler-ab' : process.argv[argument + 1])
  await fs.mkdir(outDir, { recursive: true })
  assert.deepEqual(await fs.readdir(outDir), [], '诊断输出目录必须为空，避免混用旧证据')
  let preparation
  let primary
  const runs = []
  try {
    preparation = await prepare(outDir)
    await fs.writeFile(path.join(outDir, 'plan.json'), `${JSON.stringify({ diagnosticOnly: true, label: preparation.label, node: process.version, platform: process.platform, runOrder, metadataNormalization: preparation.metadataNormalization, optionalEsbuildMerge: preparation.axis.optionalEsbuildMerge }, null, 2)}\n`)
    for (const [role, run] of runOrder) {
      process.stdout.write(`[compiler-ab] ${role} ${run}/3：完整冷构建\n`)
      runs.push(await measure(preparation.roots[role], role, run, outDir, { nativeHelpers: preparation.nativeHelpers[role].helpers, unrefServices: preparation.nativeHelpers[role].packages, identity: preparation.identities[role] }))
    }
    const report = { diagnosticOnly: true, preparation, runOrder, runs }
    const markdown = markdownReport(preparation, runs)
    await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    await fs.writeFile(path.join(outDir, 'report.md'), markdown)
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)
  }
  catch (error) {
    primary = error
    try {
      await fs.writeFile(path.join(outDir, 'failure.json'), `${JSON.stringify({ diagnosticOnly: true, completedRuns: runs, error: failureEvidence(error), processes: processOwnership() }, null, 2)}\n`)
    }
    catch (caught) { throw new AggregateError([error, caught], '首败证据写入失败', { cause: error }) }
    throw error
  }
  finally {
    if (preparation) {
      try { assertProcessesStopped(); await fs.rm(preparation.temporary, { recursive: true, force: true }) }
      catch (error) {
        await fs.writeFile(path.join(outDir, 'cleanup-error.json'), `${JSON.stringify({ temporary: preparation.temporary, primaryError: primary && failureEvidence(primary), cleanupError: failureEvidence(error), processes: processOwnership() }, null, 2)}\n`)
        if (!primary) throw error
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1 })
}
