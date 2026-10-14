import type { PreflightReport } from './types'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { formatWorkflowError } from './cleanup'
import { readReport, request } from './client'
import { recordComputerUseBlock } from './computer-use'
import { runPreflightDaemon } from './daemon'
import { collectIdentity } from './io'
import { initialChecks, PreflightSession } from './session'

async function prepare(root: string, extended = false) {
  const runId = randomUUID()
  const dir = path.join(root, 'e2e', '.artifacts', 'preflight', runId)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'report.json')
  const report: PreflightReport = {
    schema: 'full-test-preflight/v1',
    extended,
    runId,
    identity: await collectIdentity(root),
    createdAt: new Date().toISOString(),
    status: 'blocked',
    checks: initialChecks(extended),
    endpoint: '',
    token: randomUUID(),
    challenge: randomUUID(),
  }
  const session = new PreflightSession(report, file, dir)
  await session.save()
  await runPreflightDaemon(session)
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { extended: { type: 'boolean' }, report: { type: 'string' }, reason: { type: 'string' } } })
  if (positionals.length !== 1 || !['prepare', 'verify', 'block'].includes(positionals[0]!)) {
    throw new Error('用法：pnpm e2e:preflight prepare [--extended] | verify --report <本轮 report.json> | block --report <本轮 report.json> --reason <工具错误>')
  }
  if (positionals[0] === 'prepare') {
    await prepare(process.cwd(), values.extended)
    return
  }
  if (!values.report) {
    throw new Error('verify/block 必须指定 --report。')
  }
  const report = await readReport(values.report)
  if (positionals[0] === 'block') {
    if (!values.reason) {
      throw new Error('block 必须指定 --reason，记录原始 computer use 错误。')
    }
    try {
      await request(report, 'block', { reason: values.reason })
    }
    catch {
      // 服务已结束时仍允许补充失败证据，此入口永远不能将报告变为通过。
      await recordComputerUseBlock(report, values.report, values.reason)
    }
    process.stderr.write(`[preflight] computer use 已阻断：${values.reason}\n报告：${values.report}\n`)
    process.exitCode = 1
    return
  }
  await request(report, 'verify', { identity: await collectIdentity(process.cwd()) })
  process.stdout.write(`[preflight] 全部通过；本轮可供一个全面测试入口使用：${values.report}\n`)
}

main().catch((error) => {
  process.stderr.write(`[preflight] 全面测试已阻断：${formatWorkflowError(error)}\n`)
  process.exitCode = 1
})
