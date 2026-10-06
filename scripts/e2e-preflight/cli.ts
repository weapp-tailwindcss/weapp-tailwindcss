import type { PreflightReport, ProbeId } from './types'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { readReport, request } from './client'
import { recordComputerUseBlock } from './computer-use'
import { collectIdentity } from './io'
import { consumerAlive } from './lifecycle'
import { acquireLock } from './lock'
import { serve } from './server'
import { initialChecks, PreflightSession } from './session'
import { maxAgeMs, requiredCheckIds } from './types'

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
  let release: (() => Promise<void>) | undefined
  let server: Awaited<ReturnType<typeof serve>> | undefined
  let expire: ReturnType<typeof setInterval> | undefined
  let settle: (() => void) | undefined
  const closed = new Promise<void>((resolve) => {
    settle = resolve
  })
  let stopping = false
  const stop = async () => {
    if (stopping) {
      return
    }
    stopping = true
    await session.cancel()
    if (expire) {
      clearInterval(expire)
    }
    if (report.status !== 'finished') {
      report.status = 'blocked'
      delete report.verifiedAt
      await session.save()
    }
    try {
      await server?.close()
    }
    finally {
      await release?.()
      settle?.()
    }
  }
  const interrupted = () => {
    process.exitCode = 1
    void stop()
  }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  try {
    release = await acquireLock(runId)
    server = await serve(session)
    server.onFinish(() => {
      void stop()
    })
    await session.save()
    process.stdout.write(`[preflight] 报告：${file}\n`)
    await session.probes(requiredCheckIds(extended).filter((id): id is ProbeId => id !== 'computer-use'), 'prepare')
    if (report.checks.some(check => check.id !== 'computer-use' && check.status !== 'passed')) {
      process.stderr.write(`[preflight] 环境已阻断；全面测试未启动。请查看 ${path.join(dir, 'report.md')}\n`)
      process.exitCode = 1
      return
    }
    process.stdout.write(`[preflight] 等待当前 AI 会话的 computer use 验证，尚未放行。\n页面：${report.endpoint}/challenge/${report.challenge}\n证据：${path.join(dir, 'computer-use.json')}\n验证：pnpm e2e:preflight verify --report ${JSON.stringify(file)}\n`)
    expire = setInterval(() => {
      if (report.status === 'running' && !consumerAlive(report.consumer)) {
        report.interruption = '全面测试进程已退出，本轮失效；恢复时必须重新 prepare。'
        process.stderr.write(`[preflight] ${report.interruption}\n`)
        interrupted()
      }
      else if (report.status !== 'running' && Date.now() - Date.parse(report.createdAt) > maxAgeMs) {
        process.stderr.write('[preflight] 等待验证超时，本轮失效。\n')
        interrupted()
      }
    }, 1000)
    await closed
  }
  catch (error) {
    const check = report.checks.find(item => item.id === 'base')!
    Object.assign(check, { status: 'blocked', checkedAt: new Date().toISOString(), detail: String(error) })
    await session.save()
    throw error
  }
  finally {
    await stop()
    process.removeListener('SIGINT', interrupted)
    process.removeListener('SIGTERM', interrupted)
  }
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
  process.stderr.write(`[preflight] 全面测试已阻断：${String(error)}\n`)
  process.exitCode = 1
})
