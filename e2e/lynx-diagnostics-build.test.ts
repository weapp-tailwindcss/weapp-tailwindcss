import type { LynxDiagnosticsReport } from '../packages/lynx/src/diagnostics'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { beforeAll, describe, expect, it } from 'vitest'

const example = path.resolve(import.meta.dirname, '../examples/react-lynx')
const exampleRequire = createRequire(path.join(example, 'package.json'))

function packageEntry(name: string, subpath = '.') {
  const file = exampleRequire.resolve(`${name}/package.json`)
  const exports = JSON.parse(readFileSync(file, 'utf8')).exports[subpath]
  return pathToFileURL(path.resolve(path.dirname(file), exports.import ?? exports.default)).href
}

let adapter: typeof import('../packages/lynx/src/index')
let decoder: typeof import('../packages/lynx/src/decoder')

beforeAll(async () => {
  await execa('pnpm', ['--filter', '@weapp-tailwindcss/lynx...', 'build'], { cwd: path.resolve(example, '../..'), env: { CI: '1' } })
  adapter = await import(packageEntry('@weapp-tailwindcss/lynx'))
  decoder = await import(packageEntry('@weapp-tailwindcss/lynx', './decoder'))
}, 300_000)

async function buildFixture(strict: boolean) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-diagnostics-'))
  const reports: LynxDiagnosticsReport[] = []
  let build: { close: () => Promise<void> } | undefined
  try {
    await fs.symlink(path.join(example, 'node_modules'), path.join(directory, 'node_modules'), 'junction')
    await fs.writeFile(path.join(directory, 'index.tsx'), `import {root} from '@lynx-js/react'; import './style.css'; root.render(<view className="px-[7.5px] [mask-type:luminance] pl-[7.5px] pr-[7.5px] group theme-probe app-probe"><view className="group-hover:bg-red-500" /></view>);`)
    await fs.writeFile(path.join(directory, 'style.css'), `@import 'tailwindcss' source(none);
@source inline('px-[7.5px] [mask-type:luminance] pl-[7.5px] pr-[7.5px] group-hover:bg-red-500 p-[13px] gap-[7px]');
:root { --color-brand: #f00; --brand-color: oklch(63% .2 40); }
.theme-dark { --color-brand: #00f; --brand-color: #00f; }
.theme-probe { background-color: var(--color-brand); }
.app-probe { color: var(--brand-color); }
.mixed { --tw-business: 1; mask-type: luminance; width: 10px; }
.multi, .other { mask-type: luminance; }
`)
    const [{ createRspeedy }, { pluginReactLynx }, { pluginLynxConfig }] = await Promise.all([
      import(packageEntry('@lynx-js/rspeedy')),
      import(packageEntry('@lynx-js/react-rsbuild-plugin')),
      import(packageEntry('@lynx-js/config-rsbuild-plugin')),
    ])
    const rspeedy = await createRspeedy({
      cwd: directory,
      loadEnv: false,
      rspeedyConfig: {
        mode: 'development',
        source: { entry: { main: path.join(directory, 'index.tsx') } },
        output: { distPath: { root: path.join(directory, 'dist') }, sourceMap: { css: true } },
        plugins: [
          pluginReactLynx({ engineVersion: '3.9' }),
          pluginLynxConfig({ enableCSSRule: true }),
          adapter.pluginLynxTailwindcss({ diagnostics: { strict, onReport: report => reports.push(report) } }),
        ],
      },
    })
    let failure: unknown
    try {
      build = await rspeedy.build()
    }
    catch (error) {
      failure = error
    }
    const bundle = new Uint8Array(await fs.readFile(path.join(directory, 'dist', 'main.lynx.bundle')))
    const decoded = await decoder.decodeLynxBundle(bundle)
    const artifacts = path.join(import.meta.dirname, '.artifacts', 'lynx-diagnostics', strict ? 'strict' : 'default')
    await fs.mkdir(artifacts, { recursive: true })
    await fs.writeFile(path.join(artifacts, 'main.lynx.bundle'), bundle)
    await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(reports, null, 2))
    await fs.writeFile(path.join(artifacts, 'decoded.css'), decoded.css.text)
    await fs.copyFile(path.join(directory, 'dist', '.lynx', 'main', 'tasm.json'), path.join(artifacts, 'tasm.json'))
    await fs.copyFile(path.join(directory, 'dist', '.lynx', 'main', 'main.css'), path.join(artifacts, 'input.css'))
    return { reports, failure, bundle, decoded }
  }
  finally {
    try {
      await build?.close()
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
}

describe('正式 Rspeedy hook 的业务诊断', () => {
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
