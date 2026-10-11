import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { expect, it } from 'vitest'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { generateTailwindV4Css } from '@/generation/service'

it('同一会话按入口隔离候选：空范围、迁移、恢复与独立输出', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'multi-source-ownership-'))
  const sources = [0, 1].map(index => ({
    file: path.join(root, `entry-${index}`, 'renamed.css'),
    base: path.join(root, `entry-${index}`),
    css: `@import 'tailwindcss' source(none); @source './template.vue'; @utility owned { z-index: ${index + 101}; }`,
  }))
  await Promise.all(sources.map(source => mkdir(source.base)))
  const opts = getCompilerContext({ tailwindcssBasedir: process.cwd(), generator: { target: 'weapp' }, cssPreflight: false, logLevel: 'silent' })
  const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
  const candidates = new Set(['owned'])
  try {
    for (const owner of [0, 1, -1, 0]) {
      for (const selected of [sources, [sources[0]!], [sources[1]!]]) {
        const result = await generateTailwindV4Css({
          opts, runtimeState,
          file: selected[0]!.file,
          outputFile: selected.length === 2 ? 'renamed.acss' : `isolated-${sources.indexOf(selected[0]!)}.acss`,
          rawSource: selected.map(source => source.css).join('\n'),
          runtime: candidates,
          sourceCandidates: candidates,
          cssHandlerOptions: { majorVersion: 4, isMainChunk: false, sourceOptions: { cssSources: selected } },
          cssUserHandlerOptions: { majorVersion: 4 },
          getSourceCandidatesForEntries: entries => entries?.some(entry => entry.base === sources[owner]?.base) ? candidates : new Set(),
          styleHandler: opts.styleHandler,
          debug: () => {},
          restoreLocalCssImports: false,
        })
        const values: string[] = []
        postcss.parse(result!.css).walkRules('.owned', rule => { rule.walkDecls('z-index', decl => { values.push(decl.value) }) })
        expect(values).toEqual(owner >= 0 && selected.includes(sources[owner]!) ? [String(owner + 101)] : [])
      }
    }
    const emptySources = sources.map(source => ({ ...source, css: source.css.replace("@source './template.vue';", '') }))
    const empty = await generateTailwindV4Css({
      opts, runtimeState, file: sources[0]!.file, rawSource: emptySources.map(source => source.css).join('\n'),
      runtime: candidates, sourceCandidates: candidates,
      cssHandlerOptions: { majorVersion: 4, isMainChunk: false, sourceOptions: { cssSources: emptySources } },
      cssUserHandlerOptions: { majorVersion: 4 },
      getSourceCandidatesForEntries: entries => entries?.length ? candidates : new Set(),
      styleHandler: opts.styleHandler, debug: () => {},
    })
    expect(empty!.css).not.toContain('.owned')
  }
  finally {
    await disposeCompilerOwner(runtimeState)
    await rm(root, { recursive: true, force: true })
  }
})
