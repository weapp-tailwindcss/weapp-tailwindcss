import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { mediaGateArtifactNames } from '../examples/react-lynx/src/compatibility/media-gate-contract'
import { withNativeFailureEvidence } from './lynx/failure-evidence'
import { androidFailureReaders, iosFailureReaders } from './lynx/failure-evidence-readers'

const directories: string[] = []
const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
const originalMessage = 'Lynx media gate geometry violates contract: hover-none'

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-native-failure-export-'))
  directories.push(root)
  const artifactDir = path.join(root, 'runner')
  const nativeDir = path.join(root, 'native', context.runId)
  await fs.mkdir(artifactDir)
  const optional = async (file: string) => fs.readFile(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined
    }
    throw error
  })
  const read = { failure: vi.fn(() => optional(path.join(nativeDir, 'failure.json'))), artifact: vi.fn((name: string) => optional(path.join(nativeDir, 'artifacts', name))) }
  const output = path.join(artifactDir, 'native-failure', context.runId)
  return { root, artifactDir, nativeDir, read, output }
}

it('真实失败子进程之后仍导出当前 run 的六张 PNG、原生侧车和原始失败消息，继续拒绝报告', async () => {
  const current = await fixture()
  const files = mediaGateArtifactNames().map((name, index) => [name, Buffer.from([0, 255, 128, index, 13, 10]).toString('base64')])
  const payload = JSON.stringify(files)
  const script = 'const fs = require("node:fs"); const path = require("node:path"); const [root,payload,message] = process.argv.slice(1); fs.mkdirSync(path.join(root,"artifacts"),{recursive:true}); for(const [name,data] of JSON.parse(payload)) fs.writeFileSync(path.join(root,"artifacts",name),Buffer.from(data,"base64")); fs.writeFileSync(path.join(root,"failure.json"),JSON.stringify({message})); console.error(message); process.exitCode=7'
  let failure: unknown
  const result = withNativeFailureEvidence(current.artifactDir, context, current.read, async () => {
    try {
      await execa(process.execPath, ['-e', script, current.nativeDir, payload, originalMessage])
    }
    catch (error) {
      failure = error
      throw error
    }
  })
  await expect(result).rejects.toMatchObject({ exitCode: 7, stderr: originalMessage })
  await expect(result).rejects.toBe(failure)
  for (const [name, encoded] of files) {
    expect(await fs.readFile(path.join(current.output, 'artifacts', name!))).toEqual(Buffer.from(encoded!, 'base64'))
  }
  expect(JSON.parse(await fs.readFile(path.join(current.output, 'failure.json'), 'utf8'))).toEqual({ message: originalMessage })
  expect(current.read.artifact.mock.calls.map(([name]) => name).sort()).toEqual(mediaGateArtifactNames().sort())
  expect(await fs.readdir(current.artifactDir)).toEqual(['native-failure'])
  const collection = JSON.parse(await fs.readFile(path.join(current.output, 'collection.json'), 'utf8'))
  expect(collection).toMatchObject({ source: 'lynx-native-failure-diagnostics', acceptance: 'diagnostic-only', context })
  expect(collection.files).toHaveLength(8)
  expect(collection.files.every((file: { status: string }) => file.status === 'copied')).toBe(true)
})

it('缺失诊断明确登记，不读取旧 run、任意清单或伪造通过回执', async () => {
  const current = await fixture()
  const old = path.join(current.root, 'native', 'old-run', 'artifacts')
  await fs.mkdir(old, { recursive: true })
  await fs.writeFile(path.join(old, 'media-hover-v1.native.json'), 'old sidecar')
  const failure = new Error('no current media evidence')
  await expect(withNativeFailureEvidence(current.artifactDir, context, current.read, async () => {
    throw failure
  })).rejects.toBe(failure)
  const collection = JSON.parse(await fs.readFile(path.join(current.output, 'collection.json'), 'utf8'))
  expect(collection.files.every((file: { status: string }) => file.status === 'missing')).toBe(true)
  expect(await fs.readdir(path.join(current.output, 'artifacts'))).toEqual([])
  expect(await fs.readFile(path.join(old, 'media-hover-v1.native.json'), 'utf8')).toBe('old sidecar')
})

it('部分诊断读取失败不遮蔽原错误，并保存其余文件和缺失状态', async () => {
  const current = await fixture()
  const failure = new Error('first runtime failure')
  const disk = new Error('native artifact permission denied')
  current.read.artifact.mockImplementation(async (name) => {
    if (name === 'media-hover-v1-base.png') {
      throw disk
    }
    return Buffer.from(name)
  })
  await expect(withNativeFailureEvidence(current.artifactDir, context, current.read, async () => {
    throw failure
  })).rejects.toMatchObject({ errors: [failure, expect.objectContaining({ errors: [disk] })] })
  const collection = JSON.parse(await fs.readFile(path.join(current.output, 'collection.json'), 'utf8'))
  expect(collection.files.find((file: { name: string }) => file.name === 'media-hover-v1-base.png')).toMatchObject({ status: 'failed', error: 'native artifact permission denied' })
  expect(await fs.readFile(path.join(current.output, 'artifacts', 'media-hover-v1-control.png'), 'utf8')).toBe('media-hover-v1-control.png')
})

it('非法 run 身份不访问设备或诊断路径', async () => {
  const current = await fixture()
  const run = vi.fn(async () => 'success')
  await expect(withNativeFailureEvidence(current.artifactDir, { ...context, runId: '../other' }, current.read, run)).rejects.toThrow('身份')
  expect(run).not.toHaveBeenCalled()
  expect(current.read.failure).not.toHaveBeenCalled()
  expect(current.read.artifact).not.toHaveBeenCalled()
})

it('成功执行不读取原生失败文件或创建诊断目录', async () => {
  const current = await fixture()
  await expect(withNativeFailureEvidence(current.artifactDir, context, current.read, async () => 'complete')).resolves.toBe('complete')
  expect(current.read.failure).not.toHaveBeenCalled()
  expect(current.read.artifact).not.toHaveBeenCalled()
  expect(await fs.readdir(current.artifactDir)).toEqual([])
})

it('iOS 从当前独占容器取原始文件，Android 子进程禁用终端转换并保留二进制字节', async () => {
  const current = await fixture()
  const directory = path.join(current.root, 'Library', 'Application Support', 'lynx-compat', context.runId)
  await fs.mkdir(path.join(directory, 'artifacts'), { recursive: true })
  const bytes = Buffer.from([0, 255, 13, 10, 128, 0])
  const name = 'media-hover-v1-base.png'
  await fs.writeFile(path.join(directory, 'artifacts', name), bytes)
  const ios = iosFailureReaders(current.root, context)
  expect(await ios.artifact(name)).toEqual(bytes)
  expect(await ios.failure()).toBeUndefined()
  const execute = vi.fn(async (args: string[]) => {
    expect(args).toEqual(['-s', 'selected-device', 'shell', '-T', 'run-as', 'com.weapptailwindcss.lynxcompat', 'cat', `files/lynx-compat/${context.runId}/artifacts/${name}`])
    return execa(process.execPath, ['-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]))', path.join(directory, 'artifacts', name)], { encoding: 'buffer', reject: false })
  })
  const android = androidFailureReaders({ platform: 'android', id: 'selected-device' }, context, execute)
  expect(Buffer.from((await android.artifact(name))!)).toEqual(bytes)
  for (const reader of [ios, android]) {
    expect(() => reader.artifact('../old-run/sidecar.json')).toThrow('白名单')
    expect(() => reader.artifact('report.json')).toThrow('白名单')
  }
  expect(execute).toHaveBeenCalledOnce()
})

it('Android 只有准确 ENOENT 记为缺失，设备和读取失败继续抛错', async () => {
  const source = `files/lynx-compat/${context.runId}/failure.json`
  const execute = vi.fn(async () => ({ exitCode: 1, stdout: Buffer.alloc(0), stderr: Buffer.from(`cat: ${source}: No such file or directory\n`) }))
  const read = androidFailureReaders({ platform: 'android', id: 'selected-device' }, context, execute)
  expect(await read.failure()).toBeUndefined()
  execute.mockResolvedValueOnce({ exitCode: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('device offline') })
  await expect(read.failure()).rejects.toThrow('device offline')
})
