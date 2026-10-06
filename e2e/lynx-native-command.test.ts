import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { command } from './lynx/native-command'

describe('Lynx native command diagnostics', () => {
  it('preserves timeout details even when the child produces no output', async () => {
    await expect(command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], process.cwd(), 500))
      .rejects
      .toMatchObject({ timedOut: true, message: expect.stringContaining('timed out') })
  })

  it('preserves the exit status of a silent failure', async () => {
    await expect(command(process.execPath, ['-e', 'process.exit(7)'], process.cwd()))
      .rejects
      .toMatchObject({ exitCode: 7, message: expect.stringContaining('exit code 7') })
  })

  it('preserves native error output and successful command output', async () => {
    await expect(command(process.execPath, ['-e', 'console.error("native launch failed"); process.exit(1)'], process.cwd()))
      .rejects
      .toMatchObject({ stderr: 'native launch failed' })
    await expect(command(process.execPath, ['-e', 'console.log("ready")'], process.cwd())).resolves.toBe('ready')
  })
})

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function artifact() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-command-'))
  directories.push(cwd)
  return { cwd, file: path.join(cwd, 'command.json') }
}

it('真实命令保留分流输出和完整生命周期，诊断不改变返回值', async () => {
  const { cwd, file } = await artifact()
  const result = await command(process.execPath, ['-e', 'process.stdout.write("inventory"); process.stderr.write("diagnostic")'], cwd, 5000, { file })
  expect(result).toContain('inventory')
  expect(result).toContain('diagnostic')
  const report = JSON.parse(await fs.readFile(file, 'utf8'))
  expect(report).toMatchObject({ pid: expect.any(Number), stdout: { text: 'inventory' }, stderr: { text: 'diagnostic' }, outcome: 'success' })
  const events = report.events.map((event: { name: string }) => event.name)
  expect(events).toEqual(expect.arrayContaining(['spawn', 'stdout', 'stderr', 'exit', 'close']))
  expect(events.indexOf('exit')).toBeLessThan(events.indexOf('close'))
  expect(report.events.every((event: { atMs: number }) => event.atMs >= 0)).toBe(true)
})

it('真实超时不重试，保留首次失败、原 PID 和限量输出', async () => {
  const { cwd, file } = await artifact()
  const marker = path.join(cwd, 'starts.txt')
  const source = 'require("node:fs").appendFileSync(process.argv[1], "start\\n"); process.stdout.write("x".repeat(20000)); process.stderr.write("waiting"); setInterval(() => {}, 1000)'
  await expect(command(process.execPath, ['-e', source, marker], cwd, 750, { file })).rejects.toMatchObject({ timedOut: true })
  expect(await fs.readFile(marker, 'utf8')).toBe('start\n')
  const report = JSON.parse(await fs.readFile(file, 'utf8'))
  expect(report).toMatchObject({ pid: expect.any(Number), outcome: 'failure', stdout: { bytes: 20000, truncated: true }, stderr: { text: 'waiting' } })
  expect(Buffer.byteLength(report.stdout.text)).toBeLessThanOrEqual(16 * 1024)
  expect(report.events).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'exit', signal: 'SIGTERM' })]))
}, 10_000)

it('启动失败也写诊断且不序列化进程环境', async () => {
  const { cwd, file } = await artifact()
  await expect(command(path.join(cwd, 'missing-executable'), [], cwd, 1000, { file })).rejects.toMatchObject({ code: 'ENOENT' })
  const report = JSON.parse(await fs.readFile(file, 'utf8'))
  expect(report.outcome).toBe('failure')
  expect(report.events).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'error', code: 'ENOENT' })]))
  expect(report).not.toHaveProperty('env')
})

it('诊断文件写入失败同时保留原始命令错误', async () => {
  const { cwd, file } = await artifact()
  await fs.mkdir(file)
  const error = await command(process.execPath, ['-e', 'process.exit(7)'], cwd, 5000, { file }).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toEqual([expect.objectContaining({ exitCode: 7 }), expect.objectContaining({ code: expect.any(String) })])
})

it('原命令成功但诊断写入失败时不误报成功', async () => {
  const { cwd, file } = await artifact()
  await fs.mkdir(file)
  await expect(command(process.execPath, ['-e', 'process.stdout.write("ready")'], cwd, 5000, { file })).rejects.toMatchObject({ code: expect.any(String) })
})
