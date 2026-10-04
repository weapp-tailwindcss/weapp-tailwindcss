import type { WorkerReport } from './types'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { inputFingerprint } from './artifacts'
import { pairOrder, parseOptions, statistics } from './options'
import { runWorker } from './process'
import { makeVariants, restoreOwnedSource } from './source'

async function run() {
  const options = parseOptions(process.argv.slice(2))
  const directory = `${options.output}.sessions`
  const sourceFile = path.join(options.root, 'demo', 'web', 'vue-vite-tailwindcss-v4', 'src', 'App.vue')
  const original = await readFile(sourceFile, 'utf8')
  const variants = makeVariants(original)
  await mkdir(directory, { recursive: true })
  const lockPath = path.join(options.root, '.tmp', 'oxc-vite.lock')
  await mkdir(path.dirname(lockPath), { recursive: true })
  const rows: WorkerReport[] = []
  const errors: string[] = []
  const input = await inputFingerprint(options.root)
  const report: Record<string, unknown> = {
    status: 'running',
    date: new Date().toISOString(),
    root: options.root,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.root, encoding: 'utf8' }).trim(),
    environment: { node: process.version, execPath: process.execPath, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
    method: {
      pairs: options.selfCheck ? 1 : options.pairs,
      alternating: true,
      independentNodeProcesses: true,
      target: 'web',
      headless: true,
      production: '独立 Node 进程；Vite import+真实配置 build(write:false)，未清理系统文件缓存；正式 worker 不运行 parser 预热。',
      hmr: '同一个 dev server 和页面，text/add/remove/restore 顺序保存到已验证 DOM/CSS；轮间静置 150ms 不计时。',
      memory: '每个 worker 的 process.resourceUsage().maxRSS，单位 KiB；只覆盖 Node，不包括 Chromium/其它子进程。',
      cssRemoval: '保持 demo 默认 preserveDeletedCss 策略；删除/恢复验证 DOM 与计算样式，不宣称 CSS 规则缓存已清空。',
    },
    input,
    rows,
    errors,
  }

  async function checkpoint() {
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
  }

  const lock = await open(lockPath, 'wx')
  try {
    await lock.writeFile(`${process.pid}\n`)
    for (let pair = 0; pair < (options.selfCheck ? 1 : options.pairs); pair++) {
      for (const mode of pairOrder(pair)) {
        assert.equal(await readFile(sourceFile, 'utf8'), original, '上轮 App.vue 未恢复或有外部编辑。')
        const output = path.join(directory, `${pair}-${mode}.json`)
        process.stdout.write(`[oxc-vite] pair=${pair + 1} mode=${mode}${options.selfCheck ? ' self-check' : ''}\n`)
        const result = await runWorker({ ...options, mode, pair, output })
        const row = JSON.parse(await readFile(output, 'utf8')) as WorkerReport
        rows.push(row)
        await checkpoint()
        assert(!result.timedOut && !result.signalled && result.code === 0, `worker 异常退出：${JSON.stringify(result)}`)
        assert.equal(row.status, options.selfCheck ? 'self-check' : 'passed', row.error ?? 'worker 未通过验证。')
        assert(row.restored && row.cleanupErrors.length === 0, 'worker 未成功恢复源码/释放资源。')
      }
      if (!options.selfCheck) {
        const pairRows = rows.filter(row => row.pair === pair)
        assert.equal(pairRows[0]!.build!.sha256, pairRows[1]!.build!.sha256, 'normal/raw 冷构建产物 SHA-256 不一致。')
        assert.deepEqual(pairRows[0]!.hmr.map(row => row.state), pairRows[1]!.hmr.map(row => row.state), 'normal/raw HMR 语义证据不一致。')
        assert(rows.every(row => row.build!.sha256 === rows[0]!.build!.sha256), '不同 pair 的构建产物漂移。')
      }
    }
    assert.deepEqual(await inputFingerprint(options.root), input, '运行前后源码、构建输入或依赖身份发生变化。')
    const measuredCalls = rows.reduce((sum, row) => sum + Object.entries(row.parser.counts).reduce((total, [phase, count]) => total + (phase === 'self-check' ? 0 : count.calls), 0), 0)
    report['coreOxcMeasuredCalls'] = measuredCalls
    report['attribution'] = measuredCalls === 0
      ? '真实构建/HMR 未调用被测 core Oxc parseSync；这些耗时不能用于归因 Oxc raw transfer 的收益。'
      : '存在真实 core Oxc 调用；仍须结合各阶段调用数评估，不能把 handler 加速直接宣称为项目构建加速。'
    if (!options.selfCheck) {
      report['summary'] = Object.fromEntries(['normal', 'raw'].map((mode) => {
        const group = rows.filter(row => row.mode === mode)
        return [mode, {
          build: statistics(group.map(row => row.build!.milliseconds)),
          startup: statistics(group.map(row => row.startupMs!)),
          hmr: Object.fromEntries(['text', 'add', 'remove', 'restore'].map(phase => [phase, statistics(group.map(row => row.hmr.find(sample => sample.phase === phase)!.milliseconds))])),
          peakNodeRssKiB: group.map(row => row.peakNodeRssKiB),
        }]
      }))
    }
    report['status'] = options.selfCheck ? 'self-check' : 'passed'
  }
  catch (error) {
    report['status'] = 'failed'
    errors.push(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  }
  finally {
    try {
      await restoreOwnedSource(sourceFile, original, Object.values(variants))
    }
    catch (error) {
      errors.push(`最终恢复失败：${String(error)}`)
      report['status'] = 'failed'
      process.exitCode = 1
    }
    await lock.close()
    await rm(lockPath)
    await checkpoint()
  }
  process.stdout.write(`[oxc-vite] ${String(report['status'])}: ${options.output}\n`)
}

void run().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
