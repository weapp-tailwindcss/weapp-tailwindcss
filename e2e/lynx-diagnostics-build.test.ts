import type { CssMapInput } from '../packages/lynx/src/diagnostics/input'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { beforeAll, describe, expect, it } from 'vitest'

const example = path.resolve(import.meta.dirname, '../examples/react-lynx')
const exampleRequire = createRequire(path.join(example, 'package.json'))

function packageEntry(name: string, subpath = '.') {
  const file = exampleRequire.resolve(`${name}/package.json`)
  const exports = JSON.parse(readFileSync(file, 'utf8')).exports[subpath]
  const entry = exports.import ?? exports.default
  return pathToFileURL(path.resolve(path.dirname(file), typeof entry === 'string' ? entry : entry.default)).href
}

let decoder: typeof import('../packages/lynx/src/decoder')

beforeAll(async () => {
  await execa('pnpm', ['--filter', '@weapp-tailwindcss/lynx...', 'build'], { cwd: path.resolve(example, '../..'), env: { CI: '1' } })
  decoder = await import(packageEntry('@weapp-tailwindcss/lynx', './decoder'))
}, 300_000)

async function buildFixture(strict: boolean, mode: 'development' | 'production' = 'development') {
  // 临时工程继承示例的真实依赖边界，避免 Windows 原生解析器跨盘遍历 node_modules junction。
  const temporaryRoot = path.join(example, '.tmp')
  await fs.mkdir(temporaryRoot, { recursive: true })
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'lynx-diagnostics-result-'))
  try {
    const output = path.join(directory, 'result.json')
    // 原生 Rspeedy/Rspack 在独立 Node 进程执行，避免 Vitest 模块拦截改变构建器加载边界。
    await execa(process.execPath, ['--import', 'tsx', path.join(import.meta.dirname, 'lynx/diagnostics-build-runner.ts'), String(strict), mode, output, path.join(directory, 'project')], {
      cwd: path.resolve(example, '../..'),
      env: { CI: '1' },
      timeout: 110_000,
    })
    type Result = Awaited<ReturnType<typeof import('./lynx/diagnostics-build-fixture').buildDiagnosticsFixture>>
    const result = JSON.parse(await fs.readFile(output, 'utf8')) as Omit<Result, 'inputs'> & { inputs: Array<[string, CssMapInput]> }
    return { ...result, inputs: new Map(result.inputs), bundle: new Uint8Array(result.bundle), outputs: result.outputs.map(entry => ({ ...entry, bundle: new Uint8Array(entry.bundle) })) }
  }
  finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('正式 Rspeedy hook 的业务诊断', () => {
  it('生产双入口分别绑定本轮 encoder 输入、实际资产与来源，不交叉归因', async () => {
    const { reports, failure, outputs, inputs } = await buildFixture(false, 'production')
    expect(failure).toBeUndefined()
    expect(reports.map(report => report.evidence?.outputName).sort()).toEqual(['main.lynx.bundle', 'secondary.lynx.bundle'])
    expect(new Set(outputs.map(output => createHash('sha256').update(output.bundle).digest('hex'))).size).toBe(2)
    for (const output of outputs) {
      const report = reports.find(item => item.evidence?.outputName === output.name)!
      const input = inputs.get(output.name)!
      expect(Object.keys(input.cssMap ?? {})).not.toHaveLength(0)
      expect(report.evidence).toMatchObject({
        bundleSha256: createHash('sha256').update(output.bundle).digest('hex'),
        decodedCssSha256: createHash('sha256').update(output.decoded.css.text).digest('hex'),
        decoderIdentity: decoder.lynxDecoderIdentity(),
        inputCssSha256: createHash('sha256').update(JSON.stringify([input.cssMap, input.cssSource])).digest('hex'),
      })
      const secondary = output.name === 'secondary.lynx.bundle'
      const utility = secondary ? 'secondary-rejected' : '[mask-type:luminance]'
      const otherUtility = secondary ? '[mask-type:luminance]' : 'secondary-rejected'
      const source = secondary ? 'secondary.css' : 'style.css'
      expect(report.diagnostics.some(item => item.utility === utility && item.property === 'mask-type' && item.status === 'encoder-rejected' && item.source?.file?.endsWith(source))).toBe(true)
      expect(report.diagnostics.some(item => item.utility === otherUtility)).toBe(false)
      expect(output.decoded.css.text.includes('.secondary-control')).toBe(secondary)
      expect(output.decoded.css.text.includes('.theme-probe')).toBe(!secondary)
    }
  }, 120_000)

  it.each([false, true])('strict=%s：实际发出的 bundle、输入来源和拒绝分别验证', async (strict) => {
    const { reports, failure, bundle, decoded } = await buildFixture(strict)
    expect(Boolean(failure)).toBe(strict)
    const report = reports.find(item => item.evidence?.outputName === 'main.lynx.bundle')!
    expect(report).toBeTruthy()
    const builderRequire = createRequire(exampleRequire.resolve('@lynx-js/react-rsbuild-plugin/package.json'))
    const templateRequire = createRequire(builderRequire.resolve('@lynx-js/template-webpack-plugin/package.json'))
    const encoder = JSON.parse(readFileSync(templateRequire.resolve('@lynx-js/tasm/package.json'), 'utf8'))
    expect(report.versions).toMatchObject({ encoder: encoder.version, engine: 'unknown', targetSdk: '3.9' })
    expect(report.versionEvidence.encoder).toContain('@lynx-js/tasm')
    expect(report.versionEvidence.engine).toContain('宿主')
    expect(report.evidence).toMatchObject({
      bundleSha256: createHash('sha256').update(bundle).digest('hex'),
      decoderIdentity: decoder.lynxDecoderIdentity(),
      decodedCssSha256: createHash('sha256').update(decoded.css.text).digest('hex'),
    })
    for (const property of ['padding-inline', 'mask-type']) {
      expect(report.diagnostics.some(item => item.property === property && item.status === 'encoder-rejected' && item.category === 'business')).toBe(true)
    }
    expect(report.diagnostics.some(item => item.selector?.includes('group-hover') && item.status === 'encoder-rejected')).toBe(true)
    expect(decoded.css.text).toContain('background-color: {{--color-brand}}')
    expect(decoded.css.text).toContain('color: {{--brand-color}}')
    expect(decoded.css.text).toMatch(/padding-left:\s*7\.5px/)
    expect(decoded.css.text).toMatch(/padding-right:\s*7\.5px/)
    expect(report.diagnostics.some(item => item.source?.file?.endsWith('style.css'))).toBe(true)
    expect(report.diagnostics.every(item => item.origin === 'bundle-comparison' || item.raw !== undefined)).toBe(true)
    expect(report.diagnostics.filter(item => item.property === 'mask-type').every(item => item.origin === 'bundle-comparison')).toBe(true)
    expect(report.diagnostics.filter(item => item.status === 'encoder-rejected').every(item => item.reason?.includes('实际 bundle') && item.suggestion)).toBe(true)
    expect(report.diagnostics.find(item => item.property === 'padding-inline')?.suggestion).toContain('RTL')
    expect(decoded.css.text).toMatch(/padding-top:\s*13px/)
    expect(decoded.css.text).toMatch(/padding-right:\s*13px/)
    expect(decoded.css.text).toMatch(/padding-bottom:\s*13px/)
    expect(decoded.css.text).toMatch(/padding-left:\s*13px/)
    expect(decoded.css.text).toMatch(/row-gap:\s*7px/)
    expect(decoded.css.text).toMatch(/column-gap:\s*7px/)
    const cjs = exampleRequire('@weapp-tailwindcss/lynx/decoder')
    expect((await cjs.decodeLynxBundle(bundle)).css.text).toBe(decoded.css.text)
    expect(cjs.lynxDecoderIdentity()).toBe(decoder.lynxDecoderIdentity())
    expect(report.diagnostics.some(item => /^(?:padding|gap)$/.test(item.property ?? '') && item.status === 'encoder-rejected')).toBe(false)
    expect({
      css: decoded.css.text,
      business: report.diagnostics.filter(item => item.category === 'business').map(({ selector, property, status, origin }) => ({ selector, property, status, origin })),
    }).toMatchSnapshot()
  }, 120_000)
})
