import fs from 'node:fs/promises'
import path from 'node:path'
import { describeFailure } from '../diagnostics/failures.mjs'
import { readBoundedFile } from './bounded-file.mjs'
import { jsonBytes } from './worker-evidence.mjs'

/** 在日志关闭后保存完整摘要，保留业务首败和证据失败。 */
export async function writeRuntimeControllerReport({ sessionDirectory, identity, rootPid, attached, closed, processResult, phases, checkpoints, sourceWrites, receipts, verification, execution, outcome }) {
  const report = {
    identity,
    rootPid,
    attached,
    closed,
    processResult,
    phases,
    checkpoints,
    sourceWrites,
    logReceipts: receipts,
    verification,
    firstFailure: execution.failed ? describeFailure(execution.error) : outcome.failed ? describeFailure(outcome.error) : undefined,
    diagnosticFailures: outcome.failures.map(error => describeFailure(error)),
    diagnosticOnly: true,
    budgetAcceptance: false,
    interpretation: '解析、load 与 V8 scriptParsed 不是函数执行证明；累计分配含已回收对象，不是存活堆或进程树 RSS。输出被观察不是业务提交或来源相等证明。',
  }
  let reportingFailure
  try {
    const files = await fs.readdir(sessionDirectory)
    if (files.length > 64) {
      throw new Error('weapp runtime 工件数超过固定上限')
    }
    const budget = {
      bytes: 0,
      maximumBytes: 96 * 1024 * 1024,
    }
    for (const file of files) {
      readBoundedFile(path.join(sessionDirectory, file), {
        maximumBytes: 16 * 1024 * 1024,
        budget,
      })
    }
    const actualBytes = budget.bytes
    const reportBytes = jsonBytes(report, 8 * 1024 * 1024) + 1
    if (actualBytes + reportBytes > 96 * 1024 * 1024) {
      throw new Error('weapp runtime 工件、日志与控制器摘要累计超过固定上限')
    }
  }
  catch (error) {
    reportingFailure = error
    report.verification = {
      complete: false,
      reason: '完整摘要无法在固定上限内交付；原始 profile/事件仍保留，诊断失败',
    }
    report.firstFailure ??= describeFailure(error)
    report.diagnosticFailures.push(describeFailure(error))
  }
  jsonBytes(report, 8 * 1024 * 1024)
  await fs.writeFile(path.join(sessionDirectory, 'controller.json'), `${JSON.stringify(report)}\n`, {
    flag: 'wx',
  })
  if (reportingFailure) {
    throw reportingFailure
  }
}
