import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractValidCandidates } from '@weapp-tailwindcss/engine'
import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import { build } from 'esbuild'
import { createContext } from 'weapp-tailwindcss/core'
import { makeRuntimeCase } from './runtime.mjs'

function resultOf(value) {
  const output = typeof value === 'string' ? value : value?.css ?? value?.code ?? JSON.stringify(value)
  return { output, outputBytes: Buffer.byteLength(output), outputHash: createHash('sha256').update(output).digest('hex') }
}

function postcssCss(size, variant = 'main') {
  const rules = Array.from({ length: size }, (_, index) => {
    const content = variant === 'content' && index === Math.floor(size / 2) ? 'content:var(--tw-content);' : ''
    const selector = variant === 'structured'
      ? `.u-${index}::before,.u-${index}:hover`
      : `.u-${index}`
    return `${selector}{color:red;padding:1px;margin:0;display:block;${content}}`
  })
  const body = rules.join('\n')
  if (variant === 'content') {
    return `view,text,::before,::after{--tw-content:""}\n${body}`
  }
  if (variant === 'structured') {
    return `@media (min-width:1px){${body}}`
  }
  return body
}

function coreCss(size) {
  return Array.from({ length: size }, (_, index) => `.u-${index}{color:red;padding:1px;margin:0;display:block}`).join('\n')
}

function coreWxml(size) {
  return Array.from({ length: size }, (_, index) => `<view class="u-${index} u-${(index + 1) % size}">item</view>`).join('')
}

function coreJs(size) {
  return Array.from({ length: size }, (_, index) => `export const item${index} = 'u-${index}';`).join('\n')
}

let sharedContext
function getSharedContext() {
  sharedContext ??= createContext()
  return sharedContext
}

function makePostcssCase(size, variant, cacheHit = false) {
  const id = `postcss-v4-${cacheHit ? 'cache-hit' : variant}-${size}`
  const css = postcssCss(size, variant)
  return {
    id,
    group: 'postcss',
    complexityGroup: cacheHit ? 'postcss-v4-cache-hit' : 'postcss-v4',
    size,
    fresh: !cacheHit,
    async create() {
      const handler = createStyleHandler({ appType: 'weapp-vite', majorVersion: 4, isMainChunk: true })
      return () => handler(css)
    },
  }
}

function makeCoreCase(kind, size) {
  const id = `core-${kind}-${size}`
  const input = kind === 'wxss' ? coreCss(size) : kind === 'wxml' ? coreWxml(size) : coreJs(size)
  return {
    id,
    group: 'core',
    complexityGroup: `core-${kind}`,
    size,
    fresh: false,
    async create() {
      const context = getSharedContext()
      if (kind === 'wxss') {
        return () => context.transformWxss(input, { majorVersion: 4, isMainChunk: true })
      }
      if (kind === 'wxml') {
        return () => context.transformWxml(input)
      }
      return () => context.transformJs(input)
    },
  }
}

function makeExplicitCandidateCase(size) {
  const input = coreWxml(size)
  const runtimeSet = new Set(Array.from({ length: size }, (_, index) => `u-${index}`))
  return {
    id: `core-explicit-candidates-${size}`,
    group: 'core',
    complexityGroup: 'core-explicit-candidates',
    size,
    fresh: false,
    async create() {
      const context = getSharedContext()
      return () => context.transformWxml(input, { runtimeSet })
    },
  }
}

function makeSourceScanCase(size) {
  return {
    id: `core-source-scan-${size}`,
    group: 'core',
    complexityGroup: 'core-source-scan',
    size,
    fresh: false,
    async create() {
      const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tailwindcss-perf-'))
      const sourceFile = path.join(root, 'fixture.wxml')
      await writeFile(sourceFile, coreWxml(size), 'utf8')
      return () => extractValidCandidates({
        cwd: path.resolve('.'),
        base: path.resolve('.'),
        sources: [{ base: root, pattern: '*.wxml', negated: false }],
        css: '@import "tailwindcss";',
      })
    },
  }
}

function makeIncrementalCase(mode, size) {
  const input = coreWxml(size)
  return {
    id: `core-incremental-${mode}-${size}`,
    group: 'core',
    complexityGroup: `core-incremental-${mode}`,
    size,
    fresh: mode === 'cold',
    async create() {
      const context = createContext()
      const runtimeSet = new Set(Array.from({ length: size }, (_, index) => `u-${index}`))
      let revision = 0
      return async () => {
        if (mode === 'append') {
          runtimeSet.add(`append-${revision}`)
          revision += 1
        }
        return context.transformWxml(input, { runtimeSet })
      }
    },
  }
}

function makeHmrCase(size) {
  return {
    id: `hmr-class-churn-${size}`,
    group: 'hmr',
    complexityGroup: 'hmr',
    size,
    fresh: false,
    async create() {
      const context = createContext()
      const runtimeSet = new Set()
      return async () => {
        let result = ''
        for (let cycle = 0; cycle < size; cycle += 1) {
          const className = `u-${cycle % Math.max(1, size)}`
          runtimeSet.add(className)
          result = await context.transformWxml(`<view class="${className}">item</view>`, { runtimeSet })
          runtimeSet.delete(className)
        }
        return result
      }
    },
  }
}

function makeBundlerCase(size) {
  const source = Array.from({ length: size }, (_, index) => `export const item${index} = ${index};`).join('\n')
  return {
    id: `bundler-esbuild-${size}`,
    group: 'bundler',
    complexityGroup: 'bundler',
    size,
    fresh: false,
    async create() {
      return async () => {
        const result = await build({
          stdin: { contents: source, sourcefile: 'performance-entry.ts' },
          bundle: true,
          minify: true,
          write: false,
          format: 'esm',
          platform: 'neutral',
        })
        return Buffer.concat(result.outputFiles.map(file => file.contents)).toString('utf8')
      }
    },
  }
}

export function createScenarios(config) {
  const scales = [...(config.postcssScales ?? [1000, 2000, 5000]), ...(config.includeStress ? config.postcssStressScales ?? [10000] : [])]
  const coreScales = [...(config.coreScales ?? [50, 100, 200]), ...(config.includeStress ? config.coreStressScales ?? [600, 5000] : [])]
  const incrementalScales = config.coreIncrementalScales ?? coreScales
  const structuredScales = config.postcssStructuredScales ?? scales
  const cacheScales = config.postcssCacheScales ?? scales
  const runtimeScales = config.runtimeScales ?? [100, 1000]
  const cases = [
    ...scales.flatMap(size => [makePostcssCase(size, 'main'), makePostcssCase(size, 'content')]),
    ...structuredScales.map(size => makePostcssCase(size, 'structured')),
    ...cacheScales.map(size => makePostcssCase(size, 'main', true)),
    ...coreScales.flatMap(size => [makeCoreCase('wxss', size), makeCoreCase('wxml', size), makeCoreCase('js', size), makeExplicitCandidateCase(size), makeSourceScanCase(size)]),
    ...incrementalScales.flatMap(size => ['cold', 'hit', 'append'].map(mode => makeIncrementalCase(mode, size))),
    ...(config.hmrScales ?? [25, 50, 100]).map(size => makeHmrCase(size)),
    ...(config.bundlerScales ?? [50, 100, 200]).map(size => makeBundlerCase(size)),
    ...runtimeScales.flatMap(size => (config.runtimeModes ?? ['steady']).flatMap(mode => [makeRuntimeCase('cn', size, mode), makeRuntimeCase('merge', size, mode)])),
  ]
  return config.groups ? cases.filter(item => config.groups.includes(item.group)) : cases
}

export { resultOf }
