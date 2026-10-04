import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

const demoRequire = createRequire(path.join(repo, 'demo/weapp-vite-tailwindcss-v4/package.json'))
const frameworkRequire = createRequire(demoRequire.resolve('weapp-vite/package.json'))
const viteRequire = createRequire(frameworkRequire.resolve('vite/package.json'))
const { createStatefulHmrCommonjsPlugin } = await import(pathToFileURL(frameworkRequire.resolve('weapp-vite/dist/statefulHmrCommonjs.mjs')).href)
const { rolldown } = await import(pathToFileURL(viteRequire.resolve('rolldown')).href)
const { dev } = await import(pathToFileURL(viteRequire.resolve('rolldown/experimental')).href)
const mappingRequire = createRequire(createRequire(import.meta.url).resolve('@ampproject/remapping'))
const { originalPositionFor, TraceMap } = mappingRequire('@jridgewell/trace-mapping')

it('uses the same fixed native engine for Vite and its framework', () => {
  expect(frameworkRequire('weapp-vite/package.json').version).toBe('7.4.0')
  expect(viteRequire('rolldown/package.json').version).toBe('1.2.12')
  expect(frameworkRequire.resolve('rolldown/experimental')).toBe(viteRequire.resolve('rolldown/experimental'))
})

it('composes host conversion sourcemaps back to the original module', async () => {
  const source = '\n\nexport const marker = "SOURCE_MAP_MARKER";\n'
  const build = await rolldown({
    input: 'virtual:entry',
    plugins: [{
      name: 'mapped-fixture',
      resolveId: id => id === 'virtual:entry' ? id : null,
      load: () => source,
    }, createStatefulHmrCommonjsPlugin()],
  })
  try {
    const { output } = await build.generate({ format: 'esm', sourcemap: true })
    const chunk = output.find(item => item.type === 'chunk')
    const lines = chunk.code.split('\n')
    const index = lines.findIndex(line => line.includes('SOURCE_MAP_MARKER'))
    expect(index).toBeGreaterThanOrEqual(0)
    const position = originalPositionFor(new TraceMap(chunk.map), {
      line: index + 1,
      column: lines[index].indexOf('"SOURCE_MAP_MARKER"'),
    })
    expect(position.source).toContain('virtual:entry')
    expect(position.line).toBe(3)
    expect(createStatefulHmrCommonjsPlugin().renderChunk.handler(source, { fileName: 'entry.js' }, { sourcemap: false }).map).toBeNull()
  }
  finally { await build.close() }
})

it('keeps the upstream rejection of unsupported CJS dev mode', async () => {
  await expect(dev({ input: 'virtual:entry', experimental: { devMode: {} } }, { format: 'cjs' }, { watch: { enabled: false } })).rejects.toThrow(/only supports.*esm/)
})

it.each(['chunks/module.js', 'C:\\project\\chunks\\module.js', './module.js'])('preserves live exports, host requires and native graph registration (%s)', (fileName) => {
  const code = `
import value, { increment, read } from 'external';
export { read } from 'external';
export let count = 0;
export default function update() { count++; increment(); return [value, read(), count]; }
__rolldown_runtime__.registerGraph({ ids: ['entry'], localCount: 1, edges: [[]], dynamicEdges: [[]] });
`
  let externalCount = 0
  const external = { __esModule: true, default: 'value', increment: () => externalCount++, read: () => externalCount }
  const graphs = []
  const module = { exports: {} }
  const output = createStatefulHmrCommonjsPlugin().renderChunk.handler(code, { fileName })
  runInNewContext(output.code, {
    module,
    exports: module.exports,
    require(id) {
      expect(id).toBe('external')
      return external
    },
    __rolldown_runtime__: { registerGraph: graph => graphs.push(graph) },
  })
  expect(module.exports.default()).toEqual(['value', 1, 1])
  expect(module.exports.default()).toEqual(['value', 2, 2])
  expect(module.exports.count).toBe(2)
  expect(module.exports.read()).toBe(2)
  expect(graphs).toEqual([{ ids: ['entry'], localCount: 1, edges: [[]], dynamicEdges: [[]] }])
})

it('converts real split ESM chunks to executable CommonJS without changing their imports', async () => {
  const sources = {
    'virtual:entry': `import { value } from 'virtual:shared'; export { value }; export const load = () => import('virtual:lazy')`,
    'virtual:shared': 'export const value = 7',
    'virtual:lazy': `import { value } from 'virtual:shared'; export default value * 3`,
  }
  const build = await rolldown({
    input: ['virtual:entry', 'virtual:shared'],
    plugins: [{
      name: 'fixture',
      resolveId(id) { return Object.hasOwn(sources, id) ? id : null },
      load(id) { return sources[id] },
    }, createStatefulHmrCommonjsPlugin()],
  })
  try {
    const { output } = await build.generate({ format: 'esm', entryFileNames: '[name].js', chunkFileNames: 'chunks/[name].js' })
    const chunks = new Map(output.filter(item => item.type === 'chunk').map(item => [item.fileName, item]))
    const cache = new Map()
    const evaluate = (name) => {
      if (cache.has(name)) {
        return cache.get(name).exports
      }
      const item = chunks.get(name)
      expect(item).toBeDefined()
      const module = { exports: {} }
      cache.set(name, module)
      runInNewContext(item.code, {
        module,
        exports: module.exports,
        // bundle asset name 是逻辑路径，与宿主文件系统路径分开处理。
        require: id => evaluate(path.posix.normalize(path.posix.join(path.posix.dirname(name), id))),
      })
      return module.exports
    }
    const entry = output.find(item => item.type === 'chunk' && item.facadeModuleId === 'virtual:entry')
    const module = evaluate(entry.fileName)
    expect(module.value).toBe(7)
    expect((await module.load()).default).toBe(21)
  }
  finally {
    await build.close()
  }
})
