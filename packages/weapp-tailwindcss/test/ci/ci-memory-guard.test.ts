import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { summarizeMemorySamples } from '../../../../scripts/ci-memory-guard.mjs'

const execute = promisify(execFile)
const guard = fileURLToPath(new URL('../../../../scripts/ci-memory-guard.mjs', import.meta.url))

describe('CI 内存失败诊断协议', () => {
  it('基线算法保持原语义，峰值时间选择最后一次同值采样', () => {
    const samples = [
      { at: 1000, rssMb: 30, processCount: 1, maxProcessRssMb: 30 },
      { at: 2000, rssMb: 128, processCount: 2, maxProcessRssMb: 90 },
      { at: 3000, rssMb: 200, processCount: 3, maxProcessRssMb: 100 },
      { at: 4000, rssMb: 200, processCount: 2, maxProcessRssMb: 150 },
    ]
    expect(summarizeMemorySamples(samples)).toMatchObject({
      baselineRssMb: 128,
      peakRssMb: 200,
      rssDeltaMb: 72,
      peakAt: 4000,
      peakProcessCount: 3,
      peakMaxProcessRssMb: 150,
    })
  })

  it.each([
    { name: '预算失败', childExit: 0, expectedExit: 1 },
    { name: '子命令失败', childExit: 7, expectedExit: 7 },
  ])('$name 前写出报告和有界汇总，并保留原退出状态', async ({ childExit, expectedExit }) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ci-memory-protocol-'))
    try {
      const fixture = path.join(directory, 'child.cjs')
      await writeFile(fixture, `setTimeout(() => process.exit(${childExit}), 1200)\n`)
      const quoteForShell = (value: string) => process.platform === 'win32' ? `"${value}"` : value
      let failure: { code: number, stdout: string } | undefined
      try {
        await execute(process.execPath, [guard, '--label', 'failure-protocol', '--out-dir', directory, '--max-rss-mb', '0.01', '--', quoteForShell(process.execPath), quoteForShell(fixture)], { timeout: 20000 })
      }
      catch (error) {
        failure = error as typeof failure
      }
      expect(failure?.code).toBe(expectedExit)
      const names = await readdir(directory)
      expect(names.filter(name => name.endsWith('.json'))).toHaveLength(1)
      expect(names.filter(name => name.endsWith('.md'))).toHaveLength(1)
      const report = JSON.parse(await readFile(path.join(directory, names.find(name => name.endsWith('.json'))!), 'utf8'))
      expect(report.exitCode).toBe(childExit)
      expect(report.runtime).toMatchObject({ node: process.version, platform: process.platform, arch: process.arch })
      expect(report.summary.peakAt).toBeGreaterThan(0)
      expect(report.peakProcesses.at).toBe(report.summary.peakAt)
      expect(report.peakProcesses.rows.length).toBeGreaterThan(0)
      expect(report.peakProcesses.rows.length).toBeLessThanOrEqual(20)
      expect(report.samples.every((sample: object) => !('rows' in sample))).toBe(true)
      const stdout = failure?.stdout ?? ''
      const line = stdout.split(/\r?\n/).find(value => value.startsWith('[ci-memory] summary: '))!
      expect(line).toBeDefined()
      expect(line.length).toBeLessThan(4096)
      const summary = JSON.parse(line.slice('[ci-memory] summary: '.length))
      expect(summary).toMatchObject({ exitCode: childExit, ...report.summary })
      expect(stdout.indexOf('[ci-memory] report written:')).toBeLessThan(stdout.indexOf('[ci-memory] summary:'))
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
