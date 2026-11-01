import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'
import { parseJsBenchmarkEngines } from '../../../../tools/weapp-tailwindcss-scripts/src/benchmark/js-engines'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

function fixturePattern(file: string, separator = sep) {
  // 只在进入 glob 的边界转换分隔符，避免反斜杠与 glob 转义字符混淆。
  const logical = file.split(separator).join('/')
  return separator === '\\' ? fg.win32.convertPathToPattern(logical) : fg.posix.convertPathToPattern(logical)
}

function run(script: string, args: string[], preload?: string) {
  return spawnSync(process.execPath, [
    ...(preload ? ['--import', pathToFileURL(preload).href] : []),
    '--import',
    'tsx',
    join(root, 'tools/weapp-tailwindcss-scripts/src', script),
    ...args,
  ], { cwd: root, encoding: 'utf8', timeout: 5000 })
}

describe('私有 JS 基准真实入口', () => {
  it('默认只测量现存引擎，保留指定顺序', () => {
    expect(parseJsBenchmarkEngines()).toEqual(['babel', 'oxc'])
    expect(parseJsBenchmarkEngines(' oxc,babel ')).toEqual(['oxc', 'babel'])
  })

  it('测试文件路径转换为精确 glob，保留 Windows 盘符和转义元字符', () => {
    expect(fixturePattern('C:\\bench dir\\[fixture]\\input.js', '\\')).toBe('C:/bench dir/\\[fixture\\]/input.js')
    expect(fixturePattern('/bench dir/[fixture]/input.js', '/')).toBe('/bench dir/\\[fixture\\]/input.js')
    expect(fixturePattern('\\\\server\\bench [group]\\input.js', '\\')).toBe('//server/bench \\[group\\]/input.js')
  })

  it.each(['js-bench.ts', 'js-bench-diff.ts'])('%s 加载现存低级 Babel/OXC 实现', (script) => {
    const scratch = mkdtempSync(join(tmpdir(), 'weapp-js-bench-[scope]-'))
    const fixture = join(scratch, 'fixture.js')
    const report = join(scratch, 'report.json')
    writeFileSync(fixture, 'console.log("w-[10px]")')
    try {
      const result = run(script, ['--engines=babel,oxc', '--iter=1', '--warmup=0', `--glob=${fixturePattern(fixture)}`, `--save=${report}`])
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      expect(result.stdout).not.toContain('failed:')
      expect(result.stderr).toBe('')
      if (script === 'js-bench-diff.ts') {
        const snapshot = JSON.parse(readFileSync(report, 'utf8'))
        expect(snapshot.version).toBe(1)
        expect(snapshot.meta.engines).toEqual(['babel', 'oxc'])
        expect(snapshot.files).toHaveLength(1)
        expect(Object.keys(snapshot.files[0].engines)).toEqual(['babel', 'oxc'])
        for (const engine of ['babel', 'oxc']) {
          const stats = snapshot.files[0].engines[engine]
          expect(stats.iter).toBe(1)
          expect(stats.samples).toHaveLength(1)
          expect(Number.isFinite(stats.samples[0])).toBe(true)
        }
      }
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 10000)

  it('OXC 不支持的 eval 输入继续使用原 Babel fallback', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'weapp-js-fallback-'))
    const fixture = join(scratch, 'fixture.js')
    writeFileSync(fixture, 'eval("console.log(1)")')
    try {
      const result = run('js-bench.ts', ['--engines=oxc', '--iter=1', '--warmup=0', `--glob=${fixturePattern(fixture)}`])
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/fallback:\s+1 files/)
      expect(result.stderr).toBe('')
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 10000)

  it.each(['js-bench.ts', 'js-bench-diff.ts'])('%s 保留测量错误并拒绝保存不完整报告', (script) => {
    const scratch = mkdtempSync(join(tmpdir(), 'weapp-js-failure-'))
    const fixture = join(scratch, 'fixture.js')
    const preload = join(scratch, 'preload.mjs')
    const report = join(scratch, 'report.json')
    writeFileSync(fixture, 'console.log(1)')
    const source = join(root, 'packages/weapp-tailwindcss/src/js/babel.ts')
    writeFileSync(preload, `import Module from 'node:module'
const load = Module._load
Module._load = function (request, ...args) {
  if (request === ${JSON.stringify(source)}) {
    return { jsHandler() { throw new Error('fixture engine failure') } }
  }
  return load.call(this, request, ...args)
}
`)
    try {
      const result = run(script, ['--engines=babel', '--iter=1', '--warmup=0', `--glob=${fixturePattern(fixture)}`, `--save=${report}`], preload)
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('babel failed: fixture engine failure')
      expect(existsSync(report)).toBe(false)
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 10000)

  it.each([
    { script: 'js-bench.ts', engine: 'swc', message: 'SWC benchmark engine has been retired' },
    { script: 'js-bench-diff.ts', engine: 'swc', message: 'SWC benchmark engine has been retired' },
    { script: 'js-bench.ts', engine: 'unknown', message: 'Unknown benchmark engine' },
    { script: 'js-bench-diff.ts', engine: 'unknown', message: 'Unknown benchmark engine' },
    { script: 'js-bench.ts', engine: '', message: '--engines requires at least one engine' },
    { script: 'js-bench-diff.ts', engine: '', message: '--engines requires at least one engine' },
  ])('$script 在读取输入前拒绝 $engine', ({ script, engine, message }) => {
    const scratch = mkdtempSync(join(tmpdir(), 'weapp-js-engine-'))
    const report = join(scratch, 'report.json')
    try {
      const result = run(script, [`--engines=${engine}`, '--iter=1', '--warmup=0', '--glob=__no_benchmark_source__', `--save=${report}`])
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(message)
      expect(result.stdout).not.toContain('No files matched')
      expect(existsSync(report)).toBe(false)
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 10000)

  it('旧 v3 声明生成入口明确拒绝且不改写现有 fixture', () => {
    const fixture = join(root, 'tools/weapp-tailwindcss-scripts/src/var.css')
    const before = readFileSync(fixture)
    const result = run('get-decl.ts', [])
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('旧 Tailwind v3 声明生成脚本已退役')
    expect(readFileSync(fixture)).toEqual(before)
    expect(existsSync(join(root, 'packages/weapp-tailwindcss/src/postcss/cssVars.ts'))).toBe(false)
  }, 10000)
})
