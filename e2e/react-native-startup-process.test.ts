import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { runtimeArtifactIdentity } from './react-native/runtime-artifacts'
import { readPreparedRuntimeStaticEvidence } from './react-native/runtime-static'
import { runNativeStartupCommand, terminateNativeStartupProcess } from './react-native/startup-command'
import { createNativeStartupOwner } from './react-native/startup-owner'

const directories: string[] = []
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const cli = fileURLToPath(new URL('./react-native/runtime-static-cli.ts', import.meta.url))

async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), 'rn-startup-process-'))
  directories.push(result)
  return result
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(current => rm(current, { recursive: true, force: true })))
})

it('真实同步死循环在共享期限后被终止，owner 等到进程 close 才排空', async () => {
  const root = await directory()
  const pidFile = path.join(root, 'owned-pid.json')
  const owner = createNativeStartupOwner({ deadline: Date.now() + 1_000 })
  const source = `const fs = require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync(process.argv[1], JSON.stringify({ pid: process.pid })); while (true) {}`
  const operation = owner.run('synchronous-compiler', signal => runNativeStartupCommand(process.execPath, ['-e', source, pidFile], { cwd: repoRoot, signal }))
  const outcome = operation.catch(error => error)
  try {
    let pid: number | undefined
    for (let attempt = 0; attempt < 100 && !pid; attempt++) {
      try {
        pid = JSON.parse(await readFile(pidFile, 'utf8')).pid
      }
      catch {
        await delay(5)
      }
    }
    expect(pid).toBeTypeOf('number')
    expect(await outcome).toBeInstanceOf(Error)
    expect(owner.signal.aborted).toBe(true)
    await expect(owner.drain()).rejects.toThrow('deadline exceeded')
    expect(owner.pending()).toBe(false)
    expect(() => process.kill(pid!, 0)).toThrow()
  }
  finally {
    owner.stop()
    await owner.drain().catch(() => undefined)
    owner.release()
  }
}, 10_000)

it('真实 static 子进程生成后由父进程重读固定原件，绑定当前依赖与摘要', async () => {
  const root = await directory()
  const identity = runtimeArtifactIdentity('react-native', 'react-native-ios', 'startup-process-run')
  await writeFile(path.join(root, 'runtime-session.json'), JSON.stringify(identity))
  const owner = createNativeStartupOwner({ deadline: Date.now() + 60_000 })
  try {
    const prepared = await owner.run('runtime-static', async (signal) => {
      await runNativeStartupCommand(process.execPath, ['--import', import.meta.resolve('tsx'), cli, root, identity.runId, identity.invocationId], { cwd: repoRoot, signal })
      return readPreparedRuntimeStaticEvidence(root, signal)
    })
    owner.complete()
    await owner.drain()
    expect(prepared.file).toBe(path.join(root, 'runtime-input', 'static-evidence.json'))
    expect(prepared.environment.RN_RUNTIME_STATIC_EVIDENCE_SHA256).toMatch(/^[a-f\d]{64}$/)
  }
  finally {
    owner.stop()
    await owner.drain().catch(() => undefined)
    owner.release()
  }
}, 70_000)

it('真实子进程拒绝其它 invocation，退出失败不产生静态成功原件', async () => {
  const root = await directory()
  const identity = runtimeArtifactIdentity('react-native', 'react-native-ios', 'startup-process-run')
  await writeFile(path.join(root, 'runtime-session.json'), JSON.stringify(identity))
  const controller = new AbortController()
  await expect(runNativeStartupCommand(process.execPath, ['--import', import.meta.resolve('tsx'), cli, root, identity.runId, 'other-invocation'], { cwd: repoRoot, signal: controller.signal })).rejects.toThrow('身份不符')
  await expect(readFile(path.join(root, 'runtime-static-input.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.runIf(process.platform !== 'win32')('真实根进程先 close 后，仍确认无 stdio 后代和本轮进程组消失', async () => {
  const root = await directory()
  const identityFile = path.join(root, 'worker.json')
  const heartbeat = path.join(root, 'heartbeat.txt')
  const worker = `const fs=require('node:fs'); process.on('SIGTERM',()=>{}); fs.writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,parent:process.ppid})); setInterval(()=>fs.writeFileSync(process.argv[2],String(Date.now())),10);`
  const source = `const {spawn}=require('node:child_process'); spawn(process.execPath,['-e',process.argv[1],process.argv[2],process.argv[3]],{stdio:'ignore'}); process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000);`
  const child = spawn(process.execPath, ['-e', source, worker, identityFile, heartbeat], { cwd: root, detached: true, stdio: 'ignore' })
  const closed = new Promise<void>((resolve, reject) => {
    child.once('close', () => resolve())
    child.once('error', reject)
  })
  try {
    let identity: { pid: number, parent: number } | undefined
    for (let attempt = 0; attempt < 200 && !identity; attempt++) {
      try {
        identity = JSON.parse(await readFile(identityFile, 'utf8'))
      }
      catch {
        await delay(5)
      }
    }
    expect(identity?.parent).toBe(child.pid)
    const stopped = terminateNativeStartupProcess(child)
    await closed
    await stopped
    expect(() => process.kill(-child.pid!, 0)).toThrow()
    expect(() => process.kill(identity!.pid, 0)).toThrow()
    const finalBeat = await readFile(heartbeat, 'utf8')
    await delay(50)
    expect(await readFile(heartbeat, 'utf8')).toBe(finalBeat)
  }
  finally {
    await terminateNativeStartupProcess(child)
    await closed
  }
}, 10_000)
