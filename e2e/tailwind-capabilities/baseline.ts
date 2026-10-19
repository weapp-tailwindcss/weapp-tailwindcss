import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { withGeneratorFixture } from './fixture'
import { hmrCss, hmrSource, hmrStates } from './hmr/fixture'
import { digest } from './identity'
import { weappProbes } from './weapp/fixtures'
import { webFixtureCss, webProbes } from './web/probes'

export async function fixtureOutputs(root: string) {
  const web = await withGeneratorFixture(root, webFixtureCss, {}, generator => generator.generate({ target: 'web', candidates: [...new Set(webProbes.flatMap(probe => probe.candidate.match(/\S+/g) ?? []))], scanSources: false }))
  const weapp = await withGeneratorFixture(root, '@import "tailwindcss" source(none);', {}, generator => generator.generate({ target: 'weapp', candidates: [...new Set(weappProbes.flatMap(probe => [...probe.candidates]))], scanSources: false }))
  const hmr = Object.fromEntries<string>(await Promise.all(hmrStates.map(async (state) => {
    const output = await withGeneratorFixture(root, hmrCss, { 'probe.js': hmrSource('static-baseline', state) }, generator => generator.generate({ target: 'web', candidates: [], scanSources: true }))
    return [`hmr-${state.id}.css`, output.css] as const
  })))
  return { fixtureHash: digest({ webFixtureCss, webProbes, weappProbes, hmrCss, hmrStates }), files: { 'web.css': web.css, 'weapp.wxss': weapp.css, ...hmr } }
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
