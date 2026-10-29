import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { createRuntimeGuardSession, readRuntimeGuardEvidence } from './runtime-guard.mjs'
import identity from './runtime-guard/identity.cjs'

async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'compiler runtime guard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  async function file(relative, source) {
    const filename = path.join(root, ...relative)
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, source)
    return filename
  }
  await file(['package.json'], JSON.stringify({ name: 'runtime-guard-fixture', type: 'commonjs' }))
  const cli = await file(['node_modules', 'webpack-cli', 'index.cjs'], 'module.exports = 42\n')
  await file(['node_modules', 'webpack-cli', 'package.json'], JSON.stringify({ name: 'webpack-cli', main: 'index.cjs', exports: { '.': './index.cjs', './subpath': './subpath.cjs' } }))
  await file(['node_modules', 'webpack-cli', 'subpath.cjs'], 'module.exports = 84\n')
  await file(['node_modules', 'esbuild', 'package.json'], JSON.stringify({ name: 'esbuild', main: 'index.cjs' }))
  await file(['node_modules', 'esbuild', 'index.cjs'], 'module.exports = { allowed: true }\n')
  await file(['node_modules', 'terser-webpack-plugin', 'package.json'], JSON.stringify({ name: 'terser-webpack-plugin', main: 'index.cjs' }))
  return { root, cli, file }
}

async function run(t, source, options = {}) {
  const fixture = await project(t)
  if (options.setup) await options.setup(fixture)
  const script = await fixture.file([options.esm ? 'main.mjs' : 'main.cjs'], source)
  const guard = createRuntimeGuardSession(path.join(fixture.root, 'guard'), { nativeHelpers: options.nativeHelpers ?? [] })
  const child = spawn(process.execPath, [...guard.execArgv, script], { cwd: fixture.root, env: { ...process.env, ...guard.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = { stdout: '', stderr: '' }
  let overflow
  for (const stream of ['stdout', 'stderr']) {
    child[stream].setEncoding('utf8')
    child[stream].on('data', value => {
      output[stream] += value
      if (output[stream].length > 1_000_000) {
        overflow = true
        child.kill('SIGTERM')
      }
    })
  }
  let timedOut = false
  let force
  const deadline = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
    force = setTimeout(() => child.kill('SIGKILL'), 1000)
  }, 10_000)
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  }).finally(() => { clearTimeout(deadline); clearTimeout(force) })
  assert.equal(timedOut, false, output.stderr)
  assert.equal(overflow, undefined)
  return { ...fixture, ...output, ...result, guard, pid: child.pid, evidence: () => readRuntimeGuardEvidence(guard.session, { rootPid: child.pid }) }
}

test('普通模块及CLI resolve-only保持正常，bootstrap重复预加载只记录一次', async (t) => {
  const result = await run(t, 'require.resolve("webpack-cli"); console.log(require("esbuild").allowed)')
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'true')
  assert.equal(result.evidence().isolates.length, 1)
})

for (const [name, source, esm, setup] of [
  ['CJS', 'try { require("webpack-cli") } catch {}', false],
  ['ESM', 'import "webpack-cli"', true],
  ['subpath', 'try { require("webpack-cli/subpath") } catch {}', false],
  ['absolute', 'try { require(require.resolve("webpack-cli")) } catch {}', false],
  ['cached require', 'require.cache[require.resolve("webpack-cli")] = { exports: 1 }; try { require("webpack-cli") } catch {}', false],
  ['symlink', 'try { require("./alias.cjs") } catch {}', false, async fixture => symlink(fixture.cli, path.join(fixture.root, 'alias.cjs'))],
]) {
  test(`真实加载webpack-cli必须留下不可撤销证据：${name}`, async (t) => {
    const result = await run(t, source, { esm, setup })
    assert.throws(result.evidence, /webpack-cli was loaded/)
    if (!esm) assert.equal(result.code, 0, result.stderr)
  })
}

test('普通同名文件不会被误认成CLI包', async (t) => {
  const result = await run(t, 'console.log(require("./webpack-cli.cjs"))', { setup: fixture => fixture.file(['webpack-cli.cjs'], 'module.exports = 7') })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout.trim(), '7')
  assert.equal(result.evidence().passed, true)
})

for (const name of ['webpack-cli', 'terser-webpack-plugin']) {
  test(`包内type-only manifest不遮蔽真实消费身份：${name}`, async (t) => {
    const result = await run(t, `try { require(${JSON.stringify(name)}) } catch {}`, {
      async setup(fixture) {
        await fixture.file(['node_modules', name, 'package.json'], JSON.stringify({ name, main: 'dist/index.cjs' }))
        await fixture.file(['node_modules', name, 'dist', 'package.json'], JSON.stringify({ type: 'commonjs' }))
        await fixture.file(['node_modules', name, 'dist', 'index.cjs'], name === 'webpack-cli' ? 'module.exports=1' : 'try {require("esbuild")} catch {}')
      },
    })
    assert.equal(result.code, 0, result.stderr)
    assert.throws(result.evidence, /webpack-cli was loaded|terser-webpack-plugin consumed esbuild/)
  })
}

test('Terser消费esbuild后即使catch并exit0，controller仍拒绝', async (t) => {
  const result = await run(t, 'require("terser-webpack-plugin")', { setup: fixture => fixture.file(['node_modules', 'terser-webpack-plugin', 'index.cjs'], 'try { require("esbuild") } catch {}') })
  assert.equal(result.code, 0, result.stderr)
  assert.throws(result.evidence, /terser-webpack-plugin consumed esbuild/)
})

test('Terser仅resolve不污染之后的普通esbuild消费', async (t) => {
  const result = await run(t, 'require("terser-webpack-plugin"); require("esbuild")', { setup: fixture => fixture.file(['node_modules', 'terser-webpack-plugin', 'index.cjs'], 'require.resolve("esbuild")') })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.evidence().passed, true)
})

test('ESM Terser命中已缓存esbuild时保守拒绝无法证明的解析', async (t) => {
  const result = await run(t, 'import "esbuild"; await import("terser-webpack-plugin")', {
    esm: true,
    async setup(fixture) {
      await fixture.file(['node_modules', 'terser-webpack-plugin', 'package.json'], JSON.stringify({ name: 'terser-webpack-plugin', type: 'module', main: 'index.mjs' }))
      await fixture.file(['node_modules', 'terser-webpack-plugin', 'index.mjs'], 'import "esbuild"')
    },
  })
  assert.throws(result.evidence, /Terser.*esbuild|terser-webpack-plugin consumed esbuild/)
})

for (const cached of [false, true]) {
  test(`CommonJS Terser动态import也受约束，缓存=${cached}`, async (t) => {
    const result = await run(t, `${cached ? 'require("esbuild");' : ''}require("terser-webpack-plugin")`, {
      setup: fixture => fixture.file(['node_modules', 'terser-webpack-plugin', 'index.cjs'], 'module.exports = import("esbuild").catch(()=>{})'),
    })
    assert.equal(result.code, 0, result.stderr)
    assert.throws(result.evidence, /Terser.*esbuild|terser-webpack-plugin consumed esbuild/)
  })
}

for (const method of ['spawn', 'execFile', 'spawnSync', 'execFileSync', 'fork']) {
  test(`Node子进程env为空也必须覆盖，保留原始输出：${method}`, async (t) => {
    const source = method === 'fork'
      ? 'const cp=require("node:child_process"); cp.fork("./child.cjs", [], {env:{},execArgv:[]})'
      : `const cp=require("node:child_process"); const c=cp.${method}(process.execPath, ["./child.cjs"], {env:{},encoding:"utf8"}); if(typeof c === "string" || Buffer.isBuffer(c)) process.stdout.write(c); else if(c.stdout && typeof c.stdout === "string") process.stdout.write(c.stdout); else if(c.stdout) c.stdout.pipe(process.stdout)`
    const result = await run(t, source, { setup: fixture => fixture.file(['child.cjs'], 'console.log("child output")') })
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /child output/)
    const evidence = result.evidence()
    assert.equal(evidence.isolates.length, 2)
    assert.equal(evidence.launches.length, 1)
  })
}

for (const method of ['spawn', 'spawnSync', 'execFileSync', 'fork']) {
  for (const placeholder of ['null', 'undefined']) {
    test(`合法参数占位保留options：${method}/${placeholder}`, async (t) => {
      const options = '{env:{FIXTURE:"preserved"},encoding:"utf8",input:"console.log(process.env.FIXTURE)"}'
      const source = method === 'fork'
        ? `require("node:child_process").fork("./child.cjs",${placeholder},${options})`
        : `const c=require("node:child_process").${method}(process.execPath,${placeholder},${options});${method === 'spawn' ? 'c.stdout.pipe(process.stdout);c.stdin.end("console.log(process.env.FIXTURE)")' : 'process.stdout.write(c.stdout??c)'}`
      const result = await run(t, source, { setup: fixture => fixture.file(['child.cjs'], 'console.log(process.env.FIXTURE)') })
      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.stdout.trim(), 'preserved')
      assert.equal(result.evidence().launches.length, 1)
    })
  }
}

test('execFile保留显式undefined options后的callback与promisify契约', async (t) => {
  const result = await run(t, `const {execFile}=require("node:child_process");execFile(process.execPath,["./child.cjs"],undefined,(error,stdout)=>console.log("callback",stdout.trim()));const p=require("node:util").promisify(execFile)(process.execPath,["./child.cjs"]);console.log("child",!!p.child);p.then(({stdout,stderr})=>console.log("promise",stdout.trim(),stderr.length))`, { setup: fixture => fixture.file(['child.cjs'], 'console.log("retained")') })
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /callback retained/)
  assert.match(result.stdout, /child true/)
  assert.match(result.stdout, /promise retained 0/)
  assert.equal(result.evidence().launches.length, 2)
})

test('promisify错误保留stdout/stderr，业务吞掉sync超时仍拒绝样本', async (t) => {
  const result = await run(t, `require("node:util").promisify(require("node:child_process").execFile)(process.execPath,["./child.cjs"]).catch(error=>console.log(error.stdout.trim(),error.stderr.trim()));const c=require("node:child_process").spawnSync(process.execPath,["-e","setInterval(()=>{},1000)"],{timeout:250});console.log(c.error.code)`, { setup: fixture => fixture.file(['child.cjs'], 'console.log("output");console.error("failure");process.exitCode=2') })
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /output failure/)
  assert.match(result.stdout, /ETIMEDOUT/)
  assert.throws(result.evidence, /launch status unavailable/)
})

test('相对执行文件使用child cwd，路径候选覆盖POSIX和Windows', async (t) => {
  assert.deepEqual(identity.executableCandidates('./bin/node', { cwd: '/project', env: {}, platform: 'linux' }), ['/project/bin/node'])
  assert.deepEqual(identity.executableCandidates('.\\bin\\node.exe', { cwd: 'C:\\project', env: {}, platform: 'win32' }), ['C:\\project\\bin\\node.exe'])
  assert.deepEqual(identity.executableCandidates('node', { cwd: 'C:\\project', env: { Path: 'D:\\Node' }, platform: 'win32' }), ['D:\\Node\\node', 'D:\\Node\\node.com', 'D:\\Node\\node.exe'])
  const relative = `.${path.sep}node-alias${process.platform === 'win32' ? '.exe' : ''}`
  const result = await run(t, `const c=require("node:child_process").spawnSync(${JSON.stringify(relative)},["-e","console.log('relative')"],{encoding:"utf8",cwd:process.cwd()});process.stdout.write(c.stdout)`, { setup: fixture => symlink(process.execPath, path.resolve(fixture.root, relative)) })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'relative')
  assert.equal(result.evidence().passed, true)
})

test('子进程内部捕获CLI错误也不能绕过controller', async (t) => {
  const result = await run(t, 'require("node:child_process").spawnSync(process.execPath,["./child.cjs"],{env:{}})', { setup: fixture => fixture.file(['child.cjs'], 'try { require("webpack-cli") } catch {}') })
  assert.equal(result.code, 0, result.stderr)
  assert.throws(result.evidence, /webpack-cli was loaded/)
})

for (const mode of ['empty', 'shared', 'nested']) {
  test(`Worker空execArgv、环境与嵌套传播：${mode}`, async (t) => {
    const result = await run(t, `const w=require("node:worker_threads");new w.Worker(require("node:path").resolve("./worker.cjs"),{execArgv:[],env:${mode === 'shared' ? 'w.SHARE_ENV' : '{}'}})`, {
      setup: fixture => fixture.file(['worker.cjs'], mode === 'nested'
        ? 'const w=require("node:worker_threads");if(!w.workerData)new w.Worker(__filename,{execArgv:[],env:{},workerData:true})'
        : 'require("esbuild")'),
    })
    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.evidence().isolates.length, mode === 'nested' ? 3 : 2)
    if (mode === 'empty') {
      const directory = path.join(result.guard.session.directory, 'events')
      const name = (await readdir(directory)).find(value => value.startsWith(`${result.pid}-0-`))
      const filename = path.join(directory, name)
      const entries = (await readFile(filename, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))
      entries.find(entry => entry.kind === 'launch-close').targetThreadId += 1
      await writeFile(filename, `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`)
      assert.throws(result.evidence, /worker launch ownership mismatch/)
    }
  })
}

test('ESM命名导入也使用包装后的spawn与Worker', async (t) => {
  const result = await run(t, 'import {spawnSync} from "node:child_process"; import {Worker} from "node:worker_threads";spawnSync(process.execPath,["./child.cjs"],{env:{}});new Worker(new URL("./worker.cjs",import.meta.url),{execArgv:[],env:{}})', {
    esm: true,
    async setup(fixture) {
      await fixture.file(['child.cjs'], 'require("esbuild")')
      await fixture.file(['worker.cjs'], 'require("esbuild")')
    },
  })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.evidence().isolates.length, 3)
})

test('普通 unref Worker 即使 root 退出 0 也不能借用官方 service 的外部停止例外', async (t) => {
  const result = await run(t, 'const worker = new (require("node:worker_threads").Worker)(require("node:path").resolve("./worker.cjs")); worker.unref(); setTimeout(()=>{},200)', {
    setup: fixture => fixture.file(['worker.cjs'], 'setInterval(()=>{},1000)'),
  })
  assert.equal(result.code, 0, result.stderr)
  assert.throws(result.evidence, /launch close missing|launch ready missing/)
})

test('shell即使被业务catch仍被独立收据拒绝', async (t) => {
  const result = await run(t, 'try {require("node:child_process").execSync("echo bypass")}catch{}')
  assert.equal(result.code, 0)
  assert.throws(result.evidence, /shell execution/)
})

test('登记的精确原生helper保留launch和close，不要求Node ready', { skip: process.platform === 'win32' }, async (t) => {
  const binary = '/usr/bin/true'
  const sha256 = createHash('sha256').update(await readFile(binary)).digest('hex')
  const result = await run(t, `require("node:child_process").spawnSync(${JSON.stringify(binary)},[])`, { nativeHelpers: [{ path: binary, sha256, args: [] }] })
  assert.equal(result.code, 0, result.stderr)
  const evidence = result.evidence()
  assert.equal(evidence.isolates.length, 1)
  assert.equal(evidence.launches[0].targetKind, 'native')
  const directory = path.join(result.guard.session.directory, 'events')
  const filename = path.join(directory, (await readdir(directory))[0])
  const entries = (await readFile(filename, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))
  entries.find(entry => entry.kind === 'launch-intent').args.push('unregistered')
  await writeFile(filename, `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`)
  assert.throws(result.evidence, /native helper identity mismatch/)
})

for (const corruption of ['ready', 'close', 'hash', 'tail', 'close-error', 'ppid']) {
  test(`收据缺证或被篡改不能判定通过：${corruption}`, async (t) => {
    const result = await run(t, 'require("node:child_process").spawnSync(process.execPath,["./child.cjs"],{env:{}})', { setup: fixture => fixture.file(['child.cjs'], '') })
    assert.equal(result.evidence().passed, true)
    const directory = path.join(result.guard.session.directory, 'events')
    const names = await readdir(directory)
    const root = names.find(name => name.startsWith(`${result.pid}-0-`))
    const filename = path.join(directory, root)
    const entries = (await readFile(filename, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))
    if (corruption === 'ready') entries.shift()
    if (corruption === 'close') entries.splice(entries.findIndex(entry => entry.kind === 'launch-close'), 1)
    if (corruption === 'hash') entries[0].bootstrapSha = '0'.repeat(64)
    if (corruption === 'close-error') entries.find(entry => entry.kind === 'launch-close').error = 'ETIMEDOUT'
    if (corruption === 'ppid') entries[0].ppid = -1
    await writeFile(filename, entries.map(entry => JSON.stringify(entry)).join('\n') + (corruption === 'tail' ? '' : '\n'))
    assert.throws(result.evidence, /evidence invalid/)
  })
}
