import type { OutputChunk, PreRenderedAsset, RollupOutput } from 'rollup'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import { WeappTailwindcssWeb } from '@/vite-web'

const cases = [
  ['主入口显式 Web', WeappTailwindcss],
  ['完整适配器', (options: Parameters<typeof WeappTailwindcss>[0]) => WeappTailwindcss({ ...options, appType: 'native' })],
  ['专用 Web', WeappTailwindcssWeb],
] as const

const layouts = [
  { layout: 'root', assetFileNames: '[name][extname]' },
  { layout: 'hashed', assetFileNames: 'styles/[name]-[hash][extname]' },
  { layout: 'mixed', assetFileNames: (asset: PreRenderedAsset) => asset.names.includes('secondary.css') ? 'styles/[name]-[hash][extname]' : '[name][extname]' },
]
const buildCases = cases.flatMap(([label, createPlugins]) => layouts.map(layout => ({ label, createPlugins, ...layout, cssSourceTrace: false })))
buildCases.push({ label: '完整适配器来源追踪', createPlugins: cases[1][1], ...layouts[2]!, cssSourceTrace: true })

it.each(buildCases)('独立 Web 入口通过自己的构建图消费最终样式：$label $layout', async ({ createPlugins, assetFileNames, cssSourceTrace, layout }) => {
  const root = await mkdtemp(path.join(process.cwd(), '.tmp-vite-independent-entries-'))
  try {
    const entries = ['main', 'secondary']
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'independent-web-entries', private: true, type: 'module' }))
    await writeFile(path.join(root, 'view.html'), '<div class="bg-accent w-[3px]"></div>')
    await writeFile(path.join(root, 'theme.cjs'), 'module.exports = { theme: { extend: { colors: { accent: "#123456" } } } }')
    for (const entry of entries) {
      await writeFile(path.join(root, `${entry}.js`), `import "./${entry}.css"`)
      await writeFile(path.join(root, `${entry}.css`), `@import "tailwindcss" source(none); @source "./view.html"; @config "./theme.cjs";
.author-${entry}{height:19px}`)
    }
    await writeFile(path.join(root, 'unrelated.js'), 'import "./unrelated.css"')
    await writeFile(path.join(root, 'unrelated.css'), '.standalone{color:purple}')
    const result = await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: createPlugins({
        tailwindcssBasedir: root,
        cssSourceTrace,
        cssEntries: entries.map(entry => path.join(root, `${entry}.css`)),
        generator: { target: 'web' },
      }),
      css: {
        postcss: {
          plugins: [{
            postcssPlugin: 'framework-style-policy',
            Once(root: postcss.Root) {
              root.walkRules((rule) => {
                if (rule.selector === '.bg-accent') {
                  rule.selector = '.framework-accent'
                }
              })
              root.walkDecls('width', (declaration) => {
                if (declaration.value === '3px') {
                  declaration.value = '7px'
                }
              })
            },
          }],
        },
      },
      build: {
        write: false,
        minify: false,
        cssMinify: false,
        rollupOptions: {
          input: Object.fromEntries([...entries, 'unrelated'].map(entry => [entry, path.join(root, `${entry}.js`)])),
          output: { assetFileNames },
        },
      },
    }) as RollupOutput
    const chunks = new Map(result.output.filter((output): output is OutputChunk => output.type === 'chunk').map(chunk => [chunk.fileName, chunk]))
    const cssForEntry = (entry: string) => {
      const owner = [...chunks.values()].find(chunk => chunk.isEntry && chunk.name === entry)
      expect(owner).toBeDefined()
      const visited = new Set<string>()
      const styles = new Set<string>()
      const visit = (chunk: OutputChunk) => {
        if (visited.has(chunk.fileName)) {
          return
        }
        visited.add(chunk.fileName)
        const metadata = (chunk as OutputChunk & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata
        for (const file of metadata?.importedCss ?? []) {
          styles.add(file)
        }
        for (const file of chunk.imports) {
          const imported = chunks.get(file)
          if (imported) {
            visit(imported)
          }
        }
      }
      visit(owner!)
      expect(styles.size).toBeGreaterThan(0)
      if (layout === 'mixed' && entry !== 'unrelated') {
        expect([...styles].some(file => file.startsWith('styles/'))).toBe(entry === 'secondary')
      }
      return [...styles].map((file) => {
        const output = result.output.find(output => output.type === 'asset' && output.fileName === file)
        expect(output?.type).toBe('asset')
        return output?.type === 'asset' ? String(output.source) : ''
      }).join('\n')
    }
    for (const entry of entries) {
      const css = cssForEntry(entry)
      const declarations: Array<[string, string, string]> = []
      postcss.parse(css).walkRules((rule) => {
        rule.walkDecls(declaration => declarations.push([rule.selector, declaration.prop, declaration.value]))
      })
      expect(declarations).toContainEqual(['.framework-accent', 'background-color', '#123456'])
      expect(declarations).toContainEqual(['.w-\\[3px\\]', 'width', '7px'])
      expect(declarations).toContainEqual([`.author-${entry}`, 'height', '19px'])
      expect(declarations).not.toContainEqual(['.bg-accent', 'background-color', '#123456'])
      expect(declarations.some(([, property, value]) => property === 'width' && value === '3px')).toBe(false)
      expect(css).toContain('@layer base')
      expect(css).toContain('@layer theme')
    }
    const unrelatedCss = cssForEntry('unrelated')
    expect(unrelatedCss).toContain('.standalone')
    expect(unrelatedCss).not.toContain('.framework-accent')
    expect(unrelatedCss).not.toContain('@layer base')
    expect(unrelatedCss).not.toContain('@layer theme')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
