import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { collectFrameworkIdeDiagnostics } from './frameworkIdeDiagnostics'

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, readdir: vi.fn(fs.readdir), readFile: vi.fn(fs.readFile) }
})
vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: 'wechatwebdevtools --token=private-process' }) }))
const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

it('失败诊断只记录当前测试身份，不扫描共享账号日志或全局进程参数', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-ide-diagnostics-'))
  tempDirs.push(dir)
  const logs = path.join(dir, 'another-project', 'WeappLog')
  await mkdir(logs, { recursive: true })
  await writeFile(path.join(logs, 'stderr.log'), 'private-account-log')
  vi.stubEnv('E2E_IDE_DEVTOOLS_SUPPORT_DIR', dir)
  vi.stubEnv('E2E_IDE_DIAGNOSTIC_PROCESSES', '1')
  const diagnostics = await collectFrameworkIdeDiagnostics('fixture-case')
  expect(diagnostics).toContain('[e2e:ide] diagnostics for fixture-case')
  expect(diagnostics).toContain(String(process.pid))
  expect(diagnostics).toContain(process.cwd())
  expect(diagnostics).not.toContain('private-account-log')
  expect(diagnostics).not.toContain('private-process')
  expect(readdir).not.toHaveBeenCalled()
  expect(readFile).not.toHaveBeenCalled()
  expect(execa).not.toHaveBeenCalled()
})
