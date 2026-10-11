import type { CompilerSnapshot } from '@/core'
import { postcss } from '@weapp-tailwindcss/postcss'
import { createCompiler } from '@/core'
import { resolveTailwindV4Source } from '@/generator'

const sourceCss = `
@theme default {
  --spacing: 0.25rem;
}
@tailwind utilities;
`

async function runFrameworkPostcss(css: string) {
  return postcss([{
    Once(root) {
      root.append({ text: 'framework-postcss' })
    },
    postcssPlugin: 'framework-fixture',
  }]).process(css, { from: undefined })
}

function projectReachableSnapshots(
  compiler: ReturnType<typeof createCompiler>,
  entryId: string,
  graph: ReadonlyMap<string, readonly string[]>,
  snapshots: ReadonlyMap<string, CompilerSnapshot>,
) {
  const reachable = graph.get(entryId) ?? []
  return compiler.mergeSnapshots(reachable.map((id) => {
    const snapshot = snapshots.get(id)
    if (!snapshot) {
      throw new Error(`缺少样式 root snapshot：${id}`)
    }
    return snapshot
  }))
}

describe('framework compiler transaction fixture', () => {
  it('projects reachable style roots through framework PostCSS into consistent mini-program assets', async () => {
    const compiler = createCompiler()
    const source = await resolveTailwindV4Source({ base: process.cwd(), css: sourceCss })
    const requests = [
      { candidates: ['w-[10px]'], id: 'style:main' },
      { candidates: ['m-[2px]'], id: 'style:normal-subpackage' },
      { candidates: ['text-[13px]'], id: 'style:independent-subpackage' },
    ] as const
    const generated = await Promise.all(requests.map(request => compiler.generate({
      ...request,
      scanSources: false,
      source,
      target: 'web',
    })))
    const generatedById = new Map(requests.map((request, index) => [request.id, generated[index]!]))
    const snapshots = new Map(requests.map((request, index) => [request.id, generated[index]!.snapshot]))
    const moduleGraph = new Map<string, readonly string[]>([
      ['entry:normal', ['style:main', 'style:normal-subpackage']],
      ['entry:independent', ['style:independent-subpackage']],
    ])

    const normalSnapshot = projectReachableSnapshots(compiler, 'entry:normal', moduleGraph, snapshots)
    const independentSnapshot = projectReachableSnapshots(compiler, 'entry:independent', moduleGraph, snapshots)
    const normalWebCss = [
      generatedById.get('style:main')!.css,
      generatedById.get('style:normal-subpackage')!.css,
    ].join('\n')
    const independentWebCss = generatedById.get('style:independent-subpackage')!.css
    const [normalPostcss, independentPostcss] = await Promise.all([
      runFrameworkPostcss(normalWebCss),
      runFrameworkPostcss(independentWebCss),
    ])
    const [normalCss, independentCss, normalJs, independentJs, normalTemplate] = await Promise.all([
      compiler.transformCssRoot(normalPostcss.root, normalSnapshot),
      compiler.transformCssRoot(independentPostcss.root, independentSnapshot),
      compiler.transformJavaScript('const value = "w-[10px] m-[2px] text-[13px]"', normalSnapshot),
      compiler.transformJavaScript('const value = "w-[10px] m-[2px] text-[13px]"', independentSnapshot),
      compiler.transformTemplate('<view class="w-[10px] m-[2px] text-[13px]" />', normalSnapshot),
    ])

    expect(normalCss.css).toContain('.w-_b10px_B')
    expect(normalCss.css).toContain('.m-_b2px_B')
    expect(normalCss.css).not.toContain('.text-_b13px_B')
    expect(independentCss.css).toContain('.text-_b13px_B')
    expect(independentCss.css).not.toContain('.w-_b10px_B')
    expect(normalCss.css).toContain('framework-postcss')
    expect(normalJs.code).toContain('w-_b10px_B m-_b2px_B text-[13px]')
    expect(independentJs.code).toContain('w-[10px] m-[2px] text-_b13px_B')
    expect(normalTemplate).toContain('w-_b10px_B m-_b2px_B text-[13px]')

    await compiler.dispose()
  }, 30000)
})

