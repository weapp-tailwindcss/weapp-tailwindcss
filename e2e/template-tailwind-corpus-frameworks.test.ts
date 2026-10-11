import type { ProjectEntry } from './shared'
import fs from 'node:fs/promises'
import fg from 'fast-glob'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../packages/weapp-tailwindcss/src/wxml'
import { getE2EProject } from './projectEntries'
import { clearProjectBuildState, ensureProjectBuilt } from './projectTest'

const demoRoot = path.resolve(__dirname, '../demo')
const corpusMarkers = [
  'template-corpus-card',
  'template-corpus-radial',
  'template-corpus-space',
  'template-corpus-apply',
  'template-corpus-dynamic',
  'template-corpus-hover',
] as const
const dynamicClasses = [
  'bg-[#68c828]',
  'text-[100rpx]',
  'w-[323px]',
  'h-[45px]',
] as const
const styleOutputRE = /\.(?:wxss|acss|ttss|qss|css)$/i
const textOutputRE = /\.(?:wxml|axml|swan|ttml|qml|jxml|js|wxss|acss|ttss|qss|css)$/i

function projectRoot(entry: ProjectEntry) {
  return path.resolve(demoRoot, entry.name)
}

function projectOutputRoot(entry: ProjectEntry) {
  return path.resolve(demoRoot, entry.projectPath, path.dirname(entry.cssFile))
}

async function readOutputFiles(entry: ProjectEntry) {
  const root = projectOutputRoot(entry)
  const files = await fg('**/*', {
    absolute: false,
    cwd: root,
    onlyFiles: true,
  })

  return Promise.all(files.filter(file => textOutputRE.test(file)).sort().map(async file => ({
    name: file,
    content: await fs.readFile(path.join(root, file), 'utf8'),
  })))
}

function joinOutputs(outputs: Array<{ name: string, content: string }>, pattern: RegExp) {
  return outputs
    .filter(output => pattern.test(output.name))
    .map(output => output.content)
    .join('\n')
}

function findCssRule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`))?.[0] ?? ''
}

function expectCssRuleContains(rule: string, pattern: RegExp, message: string) {
  expect(rule, message).toMatch(pattern)
}

function expectTemplateCorpusBuild(entry: ProjectEntry, outputs: Array<{ name: string, content: string }>) {
  const joined = outputs.map(output => output.content).join('\n')
  const joinedWithoutTokenSourceComments = joined.replace(/\/\*\s*tokens:[\s\S]*?\*\//g, '')
  const styles = joinOutputs(outputs, styleOutputRE)
  const scripts = joinOutputs(outputs, /\.js$/i)
  const markup = joinOutputs(outputs, /\.(?:wxml|axml|swan|ttml|qml|jxml)$/i)
  const templateRuntime = `${markup}\n${scripts}`

  for (const marker of corpusMarkers) {
    expect(joined, `${entry.name} should keep template corpus marker ${marker}`).toContain(marker)
  }

  for (const raw of dynamicClasses) {
    const escaped = replaceWxml(raw)
    expect(joined, `${entry.name} should escape template dynamic class ${raw}`).toContain(escaped)
    expect(styles, `${entry.name} should generate CSS for template dynamic class ${raw}`).toContain(escaped)
    expect(scripts, `${entry.name} should transform script-side template dynamic class ${raw}`).toContain(escaped)
    expect(joinedWithoutTokenSourceComments, `${entry.name} should not leak raw template dynamic class ${raw}`).not.toContain(raw)
  }

  expect(styles, `${entry.name} should expand bg-gradient-to-br`).toMatch(/\.bg-gradient-to-br[\s\S]*--tw-gradient-position\s*:\s*to bottom right/)
  expect(styles, `${entry.name} should emit gradient background-image`).toMatch(/background-image\s*:\s*linear-gradient\(var\(--tw-gradient-stops\)\)/)
  expect(styles, `${entry.name} should generate arbitrary radial gradient`).toMatch(/background-image\s*:\s*radial-gradient\(circle at 18% 20%,#e0f2fe,#fdf4ff 70%\)/)
  expect(styles, `${entry.name} should generate rpx padding from arbitrary value`).toMatch(/padding-top\s*:\s*24rpx/)
  expect(styles, `${entry.name} should generate arbitrary text color`).toMatch(/color\s*:\s*#123456/)

  for (const combinator of ['text+text', 'text+view', 'view+text', 'view+view']) {
    expect(styles, `${entry.name} should rewrite space-y-2 for ${combinator} children`).toContain(`.space-y-2>${combinator}`)
  }

  const applyRule = findCssRule(styles, '.template-corpus-apply')
  expectCssRuleContains(applyRule, /display\s*:\s*inline-flex/, `${entry.name} should expand template corpus @apply display`)
  expectCssRuleContains(applyRule, /border-radius\s*:\s*20rpx/, `${entry.name} should expand template corpus @apply radius`)
  expectCssRuleContains(applyRule, /font-size\s*:\s*26rpx/, `${entry.name} should expand template corpus @apply font size`)
  expectCssRuleContains(applyRule, /padding\s*:\s*10rpx 18rpx|padding-(?:top|bottom)\s*:\s*10rpx/, `${entry.name} should expand template corpus @apply padding`)

  expect(templateRuntime, `${entry.name} should transform wx custom variant class in template/runtime output`).toContain(replaceWxml('wx:bg-blue-500'))
  expect(templateRuntime, `${entry.name} should transform not-wx custom variant class in template/runtime output`).toContain(replaceWxml('not-wx:bg-red-500'))
  expect(templateRuntime, `${entry.name} should transform nested any-hover custom variant class in template/runtime output`).toContain(replaceWxml('any-hover:bg-slate-800'))
  expect(styles, `${entry.name} should generate wx custom variant CSS for mp-weixin`).toMatch(new RegExp(`\\.${replaceWxml('wx:bg-blue-500')}\\s*\\{[\\s\\S]*background-color`))
  expect(styles, `${entry.name} should drop not-wx custom variant CSS for mp-weixin`).not.toMatch(new RegExp(`\\.${replaceWxml('not-wx:bg-red-500')}\\s*\\{[\\s\\S]*background-color`))

  expect(templateRuntime, `${entry.name} should transform hover-class arbitrary important background`).toContain(replaceWxml('!bg-[gray]'))
  expect(templateRuntime, `${entry.name} should transform hover-class after content arbitrary value`).toContain(replaceWxml('after:!content-[\'good_work!\']'))
  expect(styles, `${entry.name} should generate hover-class after content CSS`).toMatch(/--tw-content\s*:\s*["']good work!["']\s*!important/)
}

describe('template Tailwind corpus across framework demos', () => {
  for (const entry of [
    getE2EProject('uni-app-vite-tailwindcss-v4'),
    getE2EProject('taro-vite-react-tailwindcss-v4'),
    getE2EProject('taro-webpack-vue3-tailwindcss-v4'),
    getE2EProject('mpx-tailwindcss-v4'),
  ]) {
    it(`${entry.name} mini-program build`, async () => {
      const root = projectRoot(entry)
      await clearProjectBuildState(root)
      await ensureProjectBuilt(root, { force: true })
      expectTemplateCorpusBuild(entry, await readOutputFiles(entry))
    }, 600_000)
  }

  it('uni-app HBuilderX demo keeps the same corpus source coverage and local output checks', async () => {
    const root = path.resolve(demoRoot, 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4')
    const style = await fs.readFile(path.join(root, 'main.css'), 'utf8')
    const page = await fs.readFile(path.join(root, 'pages/index/index.vue'), 'utf8')
    const source = `${style}\n${page}`

    for (const marker of corpusMarkers) {
      expect(source, `uni-app HBuilderX should keep template corpus marker ${marker}`).toContain(marker)
    }
    for (const raw of dynamicClasses) {
      expect(source, `uni-app HBuilderX should keep dynamic class source ${raw}`).toContain(raw)
    }

    expect(style, 'uni-app HBuilderX should keep wx custom variant fixture').toContain('@custom-variant wx')
    expect(style, 'uni-app HBuilderX should keep non-matching not-wx custom variant fixture').toContain('@custom-variant not-wx')
    expect(style, 'uni-app HBuilderX should keep complex any-hover custom variant fixture').toContain('@custom-variant any-hover')
    expect(style, 'uni-app HBuilderX should keep @apply corpus').toContain('.template-corpus-apply')
    expect(page, 'uni-app HBuilderX should keep space-y fixture').toContain('space-y-2')
    expect(page, 'uni-app HBuilderX should keep gradient fixture').toContain('bg-gradient-to-br')
    expect(page, 'uni-app HBuilderX should keep hover-class fixture').toContain('hover-class="!bg-[gray] after:!content-[\'good_work!\']"')
  })

  it('uni-app x HBuilderX demo keeps the same conservative corpus source coverage', async () => {
    const root = path.resolve(demoRoot, 'uni-app-x-vdom-tailwindcss-v4')
    const style = await fs.readFile(path.join(root, 'main.css'), 'utf8')
    const page = await fs.readFile(path.join(root, 'pages/index/index.uvue'), 'utf8')
    const source = `${style}\n${page}`

    for (const marker of corpusMarkers.filter(marker => marker !== 'template-corpus-hover')) {
      expect(source, `uni-app x should keep template corpus marker ${marker}`).toContain(marker)
    }
    for (const raw of ['bg-[#68c828]', 'text-[100px]', 'w-[323px]', 'h-[45px]']) {
      expect(source, `uni-app x should keep dynamic class source ${raw}`).toContain(raw)
    }

    expect(style, 'uni-app x should keep wx custom variant fixture').toContain('@custom-variant wx')
    expect(style, 'uni-app x should keep not-wx custom variant fixture').toContain('@custom-variant not-wx')
    expect(style, 'uni-app x should keep complex any-hover custom variant fixture').toContain('@custom-variant any-hover')
    expect(style, 'uni-app x should keep conservative @apply corpus').toContain('.template-corpus-apply')
    expect(page, 'uni-app x should keep space-y fixture').toContain('space-y-2')
    expect(page, 'uni-app x should keep gradient fixture').toContain('bg-gradient-to-br')
  })
})
