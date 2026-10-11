import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

type Phase = 'manifest' | 'verify-pnpm' | 'install' | 'verify-dependencies'
interface Output { stdout?: unknown, stderr?: unknown }

/** 每次临时工程独立记录准备过程，避免失败前没有身份或覆盖另一轮的现场。 */
export function createPreparationReport(artifacts: string, identity: Record<string, unknown>) {
  const started = Date.now()
  const report: Record<string, unknown> = {
    ...identity,
    node: process.version,
    execPath: process.execPath,
    npmExecPath: process.env['npm_execpath'],
    status: 'running',
    startedAt: new Date(started).toISOString(),
  }
  let phase: Phase = 'manifest'
  const save = async () => {
    await mkdir(artifacts, { recursive: true })
    await writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  }
  const output = async (name: string, value: Output) => {
    await mkdir(artifacts, { recursive: true })
    await writeFile(path.join(artifacts, name), `${String(value.stdout ?? '')}\n${String(value.stderr ?? '')}\n`)
  }
  return {
    async phase(value: Phase) {
      phase = value
      report['phase'] = value
      await save()
    },
    async command(command: { command: string, args: string[], shell: boolean }) {
      report['command'] = command
      await save()
    },
    async pnpm(version: string) {
      report['actualPnpm'] = version
      await save()
    },
    output,
    async passed() {
      report['status'] = 'passed'
      report['durationMs'] = Date.now() - started
      await save()
    },
    async failed(error: unknown) {
      const failure = error as Output & { code?: unknown, signal?: unknown, timedOut?: unknown, exitCode?: unknown }
      report['status'] = 'failed'
      report['durationMs'] = Date.now() - started
      report['failure'] = { message: String(error), code: failure?.code, timedOut: failure?.timedOut, signal: failure?.signal, exitCode: failure?.exitCode }
      if ((phase === 'install' || phase === 'verify-pnpm') && (failure?.stdout !== undefined || failure?.stderr !== undefined)) {
        await output(phase === 'install' ? 'install.log' : 'version.log', failure)
      }
      await save()
    },
  }
}
