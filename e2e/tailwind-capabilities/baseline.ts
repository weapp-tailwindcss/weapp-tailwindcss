import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { authoringFixtures, sourceSyntaxCases } from '@weapp-tailwindcss/test-catalog'
import { withGeneratorFixture } from './fixture'
import { frameworkSource, frameworkSourceCss, sourceFrameworks, sourceRevisions } from './framework-source/fixtures'
import { hmrCss, hmrSource, hmrStates } from './hmr/fixture'
import { digest } from './identity'
import { weappProbes } from './weapp/fixtures'
import { contextWebCandidates, contextWebFixtureCss, contextWebProbes } from './web-context/fixtures'
import { lifecycleWebCandidates, lifecycleWebFixtureCss, lifecycleWebProbes } from './web-lifecycle/fixtures'
import { webFixtureCss, webProbes } from './web/probes'

export async function fixtureOutputs(root: string) {
  const web = await withGeneratorFixture(root, webFixtureCss, {}, generator => generator.generate({ target: 'web', candidates: [...new Set(webProbes.flatMap(probe => probe.candidate.match(/\S+/g) ?? []))], scanSources: false }))
  const weapp = await withGeneratorFixture(root, '@import "tailwindcss" source(none);', {}, generator => generator.generate({ target: 'weapp', candidates: [...new Set(weappProbes.flatMap(probe => [...probe.candidates]))], scanSources: false }))
  const context = await withGeneratorFixture(root, contextWebFixtureCss, {}, generator => generator.generate({ target: 'web', candidates: contextWebCandidates, scanSources: false }))
  const lifecycle = await withGeneratorFixture(root, lifecycleWebFixtureCss, {}, generator => generator.generate({ target: 'web', candidates: lifecycleWebCandidates, scanSources: false }))
  const frameworkFixtures = sourceFrameworks.flatMap(framework => sourceRevisions.map(revision => ({ framework, revision, css: frameworkSourceCss(framework), files: { [`Probe.${framework === 'react' ? 'tsx' : 'vue'}`]: frameworkSource(framework, revision, 'static-baseline') } })))
  const frameworkFiles = Object.fromEntries<string>(await Promise.all(frameworkFixtures.map(async (fixture) => {
    const output = await withGeneratorFixture(root, fixture.css, fixture.files, generator => generator.generate({ target: 'web', candidates: [], scanSources: true }))
    return [`framework-${fixture.framework}-${fixture.revision}.css`, output.css] as const
  })))
  const hmr = Object.fromEntries<string>(await Promise.all(hmrStates.map(async (state) => {
    const output = await withGeneratorFixture(root, hmrCss, { 'probe.js': hmrSource('static-baseline', state) }, generator => generator.generate({ target: 'web', candidates: [], scanSources: true }))
    return [`hmr-${state.id}.css`, output.css] as const
  })))
  const authoring = [
    ...authoringFixtures,
    ...sourceSyntaxCases.map(item => ({ id: `scan-${item.id}`, css: `@import "tailwindcss" source(none);\n@source "./probe.${item.language}";`, files: { [`probe.${item.language}`]: item.source }, candidates: [] })),
  ]
  const authoringFiles = Object.fromEntries<string>(await Promise.all(authoring.map(async (fixture) => {
    const output = await withGeneratorFixture(root, fixture.css, fixture.files, generator => generator.generate({ target: 'web', candidates: fixture.candidates, scanSources: true }))
    return [`authoring-${fixture.id}.css`, output.css] as const
  })))
  return { fixtureHash: digest({ webFixtureCss, webProbes, weappProbes, contextWebFixtureCss, contextWebProbes, lifecycleWebFixtureCss, lifecycleWebProbes, hmrCss, hmrStates, authoring, frameworkFixtures }), files: { 'web.css': web.css, 'weapp.wxss': weapp.css, 'context.css': context.css, 'lifecycle.css': lifecycle.css, ...hmr, ...authoringFiles, ...frameworkFiles } }
}

export async function fixtureBaseline(root: string, update = false) {
  const output = await fixtureOutputs(root)
  const directory = path.join(root, 'e2e', 'tailwind-capabilities', 'baselines')
  const index = `${JSON.stringify({ schemaVersion: 2, fixtureHash: output.fixtureHash, files: Object.fromEntries(Object.entries(output.files).map(([name, css]) => [name, digest(css)])) }, null, 2)}\n`
  const files = { ...output.files, 'index.json': index }
  if (update) {
    await mkdir(directory, { recursive: true })
  }
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(directory, name)
    if (update) {
      await writeFile(file, content)
    }
    else if (await readFile(file, 'utf8') !== content) {
      throw new Error(`Tailwind 语义夹具 static 基线变化：${name}；请先审查 pnpm e2e:tailwind:static:update 的差异`)
    }
  }
  return output
}
