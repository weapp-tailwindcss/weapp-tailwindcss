import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { createProcessCommandOwner } from '../../../scripts/demo-e2e-workflow/process-command'
import { cleanupFixture } from './fixtures/watch-session-process/cleanup.mts'

it.each(['root-exited', 'root-running', 'root-exited-memory-failure'])('real pnpm session stops registered descendants: %s', async (mode) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'watch-session-process-'))
  const token = randomUUID()
  const driver = fileURLToPath(new URL('./fixtures/watch-session-process/driver.mts', import.meta.url))
  let cleanupVerified = false
  let primary: unknown
  let cleanupFailure: unknown
  try {
    // 隔离测试驱动进程；生产 stop 仍须逐 PID 验证，不依赖该进程组收尾。
    const result = await execa(process.execPath, ['--import', 'tsx', driver, mode, directory, token], {
      detached: process.platform !== 'win32',
      windowsHide: true,
      timeout: 55000,
      cleanup: false,
      reject: false,
    })
    const receipt = JSON.parse(await readFile(path.join(directory, 'receipt.json'), 'utf8'))
    cleanupVerified = receipt.cleanupVerified
    expect(result.exitCode, `${result.stderr}\n${JSON.stringify(receipt)}`).toBe(0)
    expect(receipt).toMatchObject({ passed: true, rootClose: true, afterStop: [], finalProcesses: [], cleanupVerified: true, businessCleanupVerified: true, probeCleanupVerified: true, probeCleanup: { closed: true, cleanupVerified: true }, fallbackUsed: false })
    expect(receipt.probeCleanup.probes.length).toBeGreaterThan(0)
    expect(receipt.probeCleanup.probes.every((probe: { closedAt?: number, handleRetained: boolean }) => typeof probe.closedAt === 'number' && !probe.handleRetained)).toBe(true)
    expect(receipt.registered.length).toBeGreaterThanOrEqual(3)
    process.stdout.write(`watch process fixture: ${JSON.stringify(receipt)}\n`)
  }
  catch (error) {
    primary = error
  }
  finally {
    try {
      if (cleanupVerified && !primary) {
        await rm(directory, { recursive: true, force: true })
      }
      else if (!cleanupVerified) {
        const owner = createProcessCommandOwner()
        const fallback = await cleanupFixture(directory, token, true, undefined, owner)
        let probeError: unknown
        try {
          await owner.close()
        }
        catch (error) {
          probeError = error
        }
        const probeCleanup = owner.diagnostics()
        await writeFile(path.join(directory, 'parent-cleanup.json'), JSON.stringify({ businessCleanup: fallback, probeCleanup }, null, 2))
        expect(fallback.verified && probeCleanup.cleanupVerified, `fixture cleanup unconfirmed; evidence retained at ${directory}: ${fallback.errors.join('; ')}; ${String(probeError)}`).toBe(true)
        if (probeError) {
          cleanupFailure = probeError
        }
      }
    }
    catch (error) {
      cleanupFailure = error
    }
  }
  if (primary && cleanupFailure) {
    throw new AggregateError([primary, cleanupFailure], 'fixture validation and cleanup both failed')
  }
  if (primary || cleanupFailure) {
    throw primary ?? cleanupFailure
  }
}, 70000)
