import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { createCaseDiagnostics } from '../scripts/diagnostics/controller.mjs'
import { viteTailProject } from '../scripts/diagnostics/vite-tail-observer.mjs'
import { createServiceFixture, uniProject, versionFor } from './helpers/gc-service.mjs'
import { viteOperationFixture } from './helpers/vite-operations.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('真实 Taro 身份 worker 的 input 与 tail 协议', () => {
  it.each([false, true])('input 不加载 inspector；缺失关闭阶段=%s 时控制器明确拒绝', async (omitClose) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-tail-worker-'))
    roots.push(root)
    const { cwd, entry: cli } = await createServiceFixture(root, '', 'taro.mjs', { packageName: '@tarojs/cli', binName: 'taro' })
    const entry = path.join(root, 'scripts', 'taro-build-runner.mjs')
    await fs.mkdir(path.dirname(entry), { recursive: true })
    const source = `import path from 'node:path';
process.argv[1] = ${JSON.stringify(cli)};
if (process.moduleLoadList.includes('NativeModule inspector')) throw new Error('input loaded inspector');
const observer = globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})];
const key = path.resolve(${JSON.stringify(uniProject.sourceFile)});
const store = { snapshot: () => ({ candidatesById: [[key, ['flex']]], sourceById: [[key, 'flex']], inlineIncludedCandidates: [], inlineExcludedCandidates: [] }), values: () => new Set(['flex']), getRevision: () => 1 };
observer.registerStore(store);
${viteOperationFixture()}
observer.viteTail.configuration({ command: 'build', mode: 'production', logLevel: 'silent', build: { sourcemap: false, reportCompressedSize: true, ssr: false, write: true, watch: null } });
await diagnosticGenerate();
await observer.compilation({ sourceCandidates: store.values(), runtime: store.values(), transformRuntime: store.values(), generatorRuntime: store.values() });
for (const phase of ['css-finalizer', 'rollup-write']) observer.viteTail.end(observer.viteTail.begin(phase));
const writing = observer.viteTail.begin('rollup-writeBundle');
observer.viteTail.end(observer.viteTail.begin('vite-reporter'));
observer.viteTail.end(writing);
if (!${omitClose}) observer.viteTail.end(observer.viteTail.begin('rollup-close'));
`
    await fs.writeFile(entry, source)
    await fs.writeFile(path.join(cwd, uniProject.sourceFile), 'flex')
    const diagnostics = await createCaseDiagnostics({ allocation: 'inputs', cwd, versionMeta: versionFor(root), projectMeta: { ...uniProject, key: viteTailProject }, directory: path.join(root, 'evidence'), kind: 'build', run: 1 })
    await promisify(execFile)(process.execPath, [entry], { cwd, env: { ...process.env, ...diagnostics.env }, timeout: 10000, maxBuffer: 20000 })
    if (omitClose) {
      await expect(diagnostics.finish()).rejects.toThrow('尾部阶段缺失')
    }
    else {
      await diagnostics.finish()
    }
    const directory = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
    const controller = JSON.parse(await fs.readFile(path.join(directory, 'allocation-controller.json'), 'utf8'))
    expect(controller.status).toMatchObject({ complete: true, snapshotCount: 1, viteCompletedCount: 1 })
    expect(controller.status.viteTail.events).toHaveLength(omitClose ? 12 : 14)
    expect(controller.moduleHashes['vite-tail-observer.mjs']).toMatch(/^[a-f\d]{64}$/)
    expect(await fs.readdir(directory)).not.toContain('allocation-1.json')
  }, 20000)
})
