import type { Check, ProbeContext, ProbeId, ProbeOutput } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatWorkflowError } from './cleanup'
import { runOwnedWorker } from './process'
import { remedies } from './types'

export async function runProbe(id: ProbeId, context: ProbeContext, signal?: AbortSignal): Promise<Check> {
  const prefix = path.join(context.dir, `${id}-${context.phase}-${Date.now()}`)
  const contextFile = `${prefix}-input.json`
  const resultFile = `${prefix}-output.json`
  const logFile = `${prefix}.log`
  await writeFile(contextFile, JSON.stringify(context))
  try {
    const outputLog = await runOwnedWorker({
      command: process.execPath,
      args: ['--import', 'tsx', fileURLToPath(new URL('./worker.ts', import.meta.url)), id, contextFile, resultFile],
      cwd: context.root,
      timeoutMs: context.phase === 'live' ? 45_000 : 120_000,
    }, signal)
    await writeFile(logFile, outputLog)
    const output: ProbeOutput = JSON.parse(await readFile(resultFile, 'utf8'))
    if (!output.detail || !output.binding) {
      throw new Error('探针没有返回完整目标身份。')
    }
    if (context.binding && JSON.stringify(context.binding) !== JSON.stringify(output.binding)) {
      throw new Error(`目标或版本改变：原=${JSON.stringify(context.binding)}；现=${JSON.stringify(output.binding)}`)
    }
    return { id, status: 'passed', checkedAt: new Date().toISOString(), detail: output.detail, remedy: remedies[id], evidence: [logFile, resultFile, ...(output.evidence ?? [])], binding: output.binding }
  }
  catch (error) {
    const detail = formatWorkflowError(error)
    await writeFile(logFile, detail)
    return { id, status: 'blocked', checkedAt: new Date().toISOString(), detail, remedy: remedies[id], evidence: [logFile] }
  }
}
