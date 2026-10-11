import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildTargets,
  collectPackageEntryStamps,
  resolveTargetStamps,
  shouldSkipAutoBuild,
  shouldBuild,
  withBuildLock,
} from '../../scripts/ensure-weapp-tailwindcss-built.mjs'

const temporaryRoots: string[] = []

function createPackageFixture(moduleEntry = './dist/index.js') {
  const packageRoot = mkdtempSync(path.join(tmpdir(), 'weapp-tailwindcss-ensure-'))
  temporaryRoots.push(packageRoot)
  mkdirSync(path.join(packageRoot, 'src'))
  mkdirSync(path.join(packageRoot, 'dist'))
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: moduleEntry,
        require: './dist/index.cjs',
      },
    },
    main: './dist/index.cjs',
    module: moduleEntry,
    types: './dist/index.d.ts',
  }))
  writeFileSync(path.join(packageRoot, 'src/index.ts'), 'export const value = 1\n')
  for (const file of ['dist/index.cjs', moduleEntry.slice(2), 'dist/index.d.ts']) {
    writeFileSync(path.join(packageRoot, file), '')
  }
  return packageRoot
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ensure-weapp-tailwindcss-built', () => {
  it('聚合构建时跳过 demo 的自动依赖构建', () => {
    expect(shouldSkipAutoBuild({ WEAPP_TW_SKIP_AUTO_BUILD: '1' })).toBe(true)
    expect(shouldSkipAutoBuild({})).toBe(false)
  })

  it('从 package exports 推导 ESM 与 CJS 产物扩展名', () => {
    const postcssCalc = buildTargets.find(target => target.filter === '@weapp-tailwindcss/postcss-calc')!
    const reset = buildTargets.find(target => target.filter === '@weapp-tailwindcss/reset')!

    expect(resolveTargetStamps(postcssCalc)).toEqual(expect.arrayContaining([
      'dist/index.mjs',
      'dist/index.cjs',
      'dist/index.d.ts',
    ]))
    expect(resolveTargetStamps(reset)).toEqual(expect.arrayContaining([
      'dist/index.js',
      'dist/index.cjs',
      'dist/index.d.ts',
    ]))
  })

  it('为嵌套 vite/web 导出保留声明构建标记', () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'packages/weapp-tailwindcss/package.json'), 'utf8'))
    const entryDtsScript = readFileSync(path.join(process.cwd(), 'tools/weapp-tailwindcss-scripts/src/create-entry-dts.ts'), 'utf8')

    expect(packageJson.exports['./vite/web'].types).toBe('./dist/vite/web.d.ts')
    expect(entryDtsScript).toContain("'vite/web.d.ts'")
  })

  it('只在公共入口缺失或源码更新后触发重建', () => {
    const packageRoot = createPackageFixture('./dist/index.mjs')
    const sourceFile = path.join(packageRoot, 'src/index.ts')
    const outputFile = path.join(packageRoot, 'dist/index.mjs')
    const now = Date.now() / 1000

    utimesSync(sourceFile, now - 10, now - 10)
    for (const stamp of collectPackageEntryStamps(packageRoot)) {
      utimesSync(path.join(packageRoot, stamp), now, now)
    }
    expect(shouldBuild({ packageRoot })).toBe(false)

    unlinkSync(outputFile)
    expect(shouldBuild({ packageRoot })).toBe(true)

    writeFileSync(outputFile, '')
    utimesSync(outputFile, now, now)
    utimesSync(sourceFile, now + 10, now + 10)
    expect(shouldBuild({ packageRoot })).toBe(true)
  })

  it('跨进程串行化同一个包的构建', async () => {
    const packageRoot = mkdtempSync(path.join(tmpdir(), 'weapp-tailwindcss-lock-'))
    temporaryRoots.push(packageRoot)
    const eventFile = path.join(packageRoot, 'events.log')
    const scriptPath = fileURLToPath(new URL('../../scripts/ensure-weapp-tailwindcss-built.mjs', import.meta.url))
    const childSource = `
      import { appendFileSync } from 'node:fs'
      import { withBuildLock } from ${JSON.stringify(pathToFileURL(scriptPath).href)}

      withBuildLock(process.argv[1], () => {
        appendFileSync(process.argv[2], 'start\\n')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 180)
        appendFileSync(process.argv[2], 'end\\n')
      })
    `

    const runChild = () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--input-type=module',
        '-e',
        childSource,
        packageRoot,
        eventFile,
      ], { stdio: 'ignore' })
      child.once('error', reject)
      child.once('exit', (code) => {
        if (code === 0) {
          resolve()
        }
        else {
          reject(new Error(`lock child exited with code ${code}`))
        }
      })
    })

    await Promise.all([runChild(), runChild()])

    expect(readFileSync(eventFile, 'utf8').trim().split('\n')).toEqual([
      'start',
      'end',
      'start',
      'end',
    ])
  })

  it('释放锁后允许同一进程再次进入', () => {
    const packageRoot = mkdtempSync(path.join(tmpdir(), 'weapp-tailwindcss-lock-reentry-'))
    temporaryRoots.push(packageRoot)
    const calls: number[] = []

    withBuildLock(packageRoot, () => calls.push(1))
    withBuildLock(packageRoot, () => calls.push(2))

    expect(calls).toEqual([1, 2])
  })
})
