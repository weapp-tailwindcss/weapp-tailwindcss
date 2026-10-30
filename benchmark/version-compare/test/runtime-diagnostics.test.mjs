import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeDiagnostics } from '../scripts/runtime-diagnostics/controller.mjs'
import { expectedRuntimePhases, runtimeProject, validateRuntimeRequest } from '../scripts/runtime-diagnostics/request.mjs'
import { verifyRuntimeEvidence } from '../scripts/runtime-diagnostics/verify.mjs'
import { makeFixtureRuntimeBinding } from './fixtures/runtime-diagnostics-contract.mjs'

const roots = []
const children = new Set()
const request = {
  enabled: true,
  guardMode: false,
  baselineRef: 'a'.repeat(40),
  selectedProjects: [{
    key: runtimeProject,
  }],
  buildRuns: 3,
  hmrRuns: 3,
  otherDiagnostics: false,
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  const closed = once(child, 'close')
  child.kill('SIGTERM')
  await Promise.race([closed, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('任务所属 fixture 子进程未关闭')), 5000)
    timer.unref()
  })])
}
afterEach(async () => {
  const failures = []
  for (const child of children) {
    try {
      await stop(child)
    }
    catch (error) {
      failures.push(error)
    }
  }
  children.clear()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, {
    recursive: true,
    force: true,
  })))
  if (failures.length) {
    throw new AggregateError(failures, '运行时诊断 fixture 收尾失败')
  }
})
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-runtime-fixture-')))
  roots.push(root)
  const cwd = path.join(root, 'demo')
  const packageRoot = path.join(cwd, 'node_modules', 'weapp-vite')
  await fs.mkdir(path.join(packageRoot, 'bin'), {
    recursive: true,
  })
  await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({
    name: 'runtime-fixture',
    private: true,
  }))
  await fs.writeFile(path.join(cwd, 'source.wxml'), '<view class="text-red-500">fixture</view>\n')
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: 'weapp-vite',
    version: '0.0.0-fixture',
    type: 'module',
    exports: {
      './package.json': './package.json',
    },
    bin: {
      'weapp-vite': 'bin/weapp-vite.js',
    },
  }))
  await fs.writeFile(path.join(packageRoot, 'bin', 'esm.mjs'), 'export const value = 1\n')
  await fs.writeFile(path.join(packageRoot, 'bin', 'cjs.cjs'), 'module.exports = { value: 2 }\n')
  const entry = path.join(packageRoot, 'bin', 'weapp-vite.js')
  await fs.writeFile(entry, `import { createRequire } from 'node:module'\nimport { value } from './esm.mjs'\nconst require = createRequire(import.meta.url)\nconst cjs = require('./cjs.cjs')\nlet iteration = 0\nconst timer = setInterval(() => { globalThis.current = Array.from({ length: 10000 }, (_, index) => ({ index, iteration })); iteration++ }, 10)\nconsole.log('fixture-ready', value + cjs.value)\nprocess.once('SIGTERM', () => { clearInterval(timer); console.log('fixture-closed') })\n`)
  await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\n')
  const binding = makeFixtureRuntimeBinding(root, [entry, path.join(packageRoot, 'package.json'), path.join(cwd, 'package.json'), path.join(cwd, 'source.wxml')])
  const versionMeta = {
    root,
    version: 'current:fixture',
    diagnosticIdentity: {
      role: 'current',
      sourceCommit: 'b'.repeat(40),
      sourceWorkingTreeStatus: '',
      binding,
    },
  }
  const options = {
    cwd,
    versionMeta,
    projectMeta: {
      key: runtimeProject,
      sourceFile: 'source.wxml',
    },
    directory: path.join(root, '证据 space'),
    kind: 'hmr',
    run: 1,
  }
  return {
    root,
    cwd,
    entry,
    options,
  }
}
function launch(entry, env) {
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  return child
}
async function ready(child) {
  let stdout = ''
  let stderr = ''
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`fixture 启动超时：${stderr}`)), 10000)
    child.stdout.on('data', (value) => {
      stdout += value
      if (stdout.includes('fixture-ready')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.stderr.on('data', (value) => {
      stderr += value
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (!stdout.includes('fixture-ready')) {
        reject(new Error(`fixture 提前退出 ${code}：${stderr}`))
      }
    })
  })
}
describe('weapp-vite 独立 runtime 诊断', () => {
  it.each(['descriptor', 'binding', 'matrix-valid', 'matrix-row-error', 'matrix-zero-build-rss', 'matrix-zero-hmr-rss'])('真实 Node 协议 fixture：%s', (mode) => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/runtime-diagnostics-contract.mjs', import.meta.url)), mode], {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    })
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`fixture:${mode}:ok`)
  }, 20000)
  it('严格隔离真实项目、完整 SHA、固定工作负载及正式预算', () => {
    expect(() => validateRuntimeRequest(request)).not.toThrow()
    for (const change of [{
      guardMode: true,
    }, {
      otherDiagnostics: true,
    }, {
      baselineRef: 'main',
    }, {
      selectedProjects: [{
        key: 'demo-taro-vite-react-tailwindcss-v4__mp-weixin',
      }],
    }, {
      buildRuns: 0,
    }, {
      hmrRuns: 4,
    }]) {
      expect(() => validateRuntimeRequest({
        ...request,
        ...change,
      })).toThrow()
    }
    expect(() => validateRuntimeRequest({
      enabled: false,
    })).not.toThrow()
    expect(expectedRuntimePhases()).toHaveLength(8)
  })
  it('关闭模式不创建目录，带 Git 元数据的 checkout 无法启动', async () => {
    const {
      root,
      options,
    } = await fixture()
    expect(await createRuntimeDiagnostics({
      ...options,
      directory: undefined,
    })).toBeUndefined()
    await expect(fs.access(options.directory)).rejects.toThrow()
    await fs.writeFile(path.join(root, '.git'), 'gitdir: unrelated\n')
    await expect(createRuntimeDiagnostics(options)).rejects.toThrow('无 Git 元数据')
  })
  it('真实 Node 分别记录 import、require、V8 parsed 和八份分配证据，错误入口不启动 inspector', async () => {
    const {
      root,
      options,
    } = await fixture()
    const diagnostics = await createRuntimeDiagnostics(options)
    const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_RUNTIME_SESSION)
    const wrong = path.join(root, 'wrapper-only.mjs')
    await fs.writeFile(wrong, 'console.log("wrapper-only")\n')
    const wrapper = launch(wrong, diagnostics.env)
    await once(wrapper, 'close')
    await expect(fs.access(path.join(identity.sessionDirectory, 'process-start.json'))).rejects.toThrow()
    const child = launch(identity.expectedEntry, diagnostics.env)
    diagnostics.spawned(child.pid, child)
    try {
      await ready(child)
      for (const [type, round] of expectedRuntimePhases().slice(0, -1)) {
        await diagnostics.checkpoint(type, round)
      }
      await diagnostics.beforeStop()
    }
    finally {
      await stop(child)
    }
    await diagnostics.finish()
    const controller = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
    expect(controller).toMatchObject({
      diagnosticOnly: true,
      budgetAcceptance: false,
      verification: {
        pid: child.pid,
        profiles: expect.any(Array),
      },
    })
    expect(controller.verification.profiles).toHaveLength(8)
    const events = (await fs.readFile(path.join(identity.sessionDirectory, 'modules.ndjson'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(events.some(event => event.type === 'node.resolve' && event.specifier === './esm.mjs')).toBe(true)
    expect(events.some(event => event.type === 'node.resolve' && event.specifier === './cjs.cjs')).toBe(true)
    expect(events.some(event => event.type === 'node.load' && event.url?.endsWith('/esm.mjs'))).toBe(true)
    expect(events.some(event => event.type === 'v8.script-parsed' && event.url?.endsWith('/esm.mjs'))).toBe(true)
    const gc = (await fs.readFile(path.join(identity.sessionDirectory, 'gc.ndjson'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(gc[0].type).toBe('observer-start')
    // 自然 GC 是否到达回调不确定；不为了让测试出现事件而主动请求回收。
    const profile = path.join(identity.sessionDirectory, 'profile-1.json.gz')
    await fs.appendFile(profile, Buffer.from('tampered'))
    await expect(verifyRuntimeEvidence(identity.sessionDirectory, identity, controller.checkpoints)).rejects.toThrow('哈希或尺寸')
  }, 30000)
  it('真实入口源码在 controller 建立后变化会留下首败并禁止成功声明', async () => {
    const {
      entry,
      options,
    } = await fixture()
    const diagnostics = await createRuntimeDiagnostics(options)
    const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_RUNTIME_SESSION)
    await fs.appendFile(entry, '\n// fixture changed\n')
    const child = launch(entry, diagnostics.env)
    diagnostics.spawned(child.pid, child)
    await once(child, 'close')
    await expect(diagnostics.finish()).rejects.toThrow()
    const status = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'status.json'), 'utf8'))
    expect(status.complete).toBe(false)
    expect(status.firstFailure).toMatch(/绑定|哈希/)
  })
})
