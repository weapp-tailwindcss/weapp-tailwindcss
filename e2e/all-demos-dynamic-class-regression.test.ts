import type { ProjectEntry } from './shared'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { replaceWxml } from '../packages/weapp-tailwindcss/src/wxml'
import { DEMO_COVERAGE_MATRIX } from './demoCoverageMatrix'
import { E2E_PROJECTS } from './projectEntries'
import { clearProjectBuildState, ensureProjectBuilt } from './projectTest'
import { projectFilter } from './shared'
import { joinOutputsWithoutCssSourceTraces } from './snapshot/css-source-trace'

const fixturesRoot = path.resolve(__dirname, '../demo')
const rawClasses = ['h-[458rpx]', 'w-[218rpx]', 'inset-x-[30%]'] as const
const scriptOnlyClasses = ['mt-[461rpx]', 'text-[39rpx]', 'bg-[#13579b]'] as const
const habitClasses = [
  'rounded-[17rpx]',
  'border-[#2468ac]',
  'px-[19rpx]',
  'py-[23rpx]',
  'opacity-[0.73]',
  'shadow-[0_8rpx_16rpx_rgba(1,2,3,0.4)]',
  'gap-[13rpx]',
  'leading-[55rpx]',
  'text-[length:41rpx]',
] as const
const rawClassStyleExpectations: Record<typeof rawClasses[number] | typeof scriptOnlyClasses[number] | typeof habitClasses[number], RegExp[]> = {
  'h-[458rpx]': [/height\s*:\s*458rpx/i],
  'w-[218rpx]': [/width\s*:\s*218rpx/i],
  'inset-x-[30%]': [
    /left\s*:\s*30%/i,
    /right\s*:\s*30%/i,
  ],
  'mt-[461rpx]': [/margin-top\s*:\s*461rpx/i],
  'text-[39rpx]': [/font-size\s*:\s*39rpx/i],
  'bg-[#13579b]': [/background-color\s*:\s*(?:#13579b|rgba\(19,\s*87,\s*155\b)/i],
  'rounded-[17rpx]': [/border-radius\s*:\s*17rpx/i],
  'border-[#2468ac]': [/border-color\s*:\s*(?:#2468ac|rgba\(36,\s*104,\s*172\b)/i],
  'px-[19rpx]': [
    /padding-left\s*:\s*19rpx/i,
    /padding-right\s*:\s*19rpx/i,
  ],
  'py-[23rpx]': [
    /padding-top\s*:\s*23rpx/i,
    /padding-bottom\s*:\s*23rpx/i,
  ],
  'opacity-[0.73]': [/opacity\s*:\s*(?:0\.73|\.73)/i],
  'shadow-[0_8rpx_16rpx_rgba(1,2,3,0.4)]': [/--tw-shadow\s*:\s*0 8rpx 16rpx[^;]*rgba\(1,\s*2,\s*3,\s*(?:0\.4|\.4)\)/i],
  'gap-[13rpx]': [/gap\s*:\s*13rpx/i],
  'leading-[55rpx]': [/line-height\s*:\s*55rpx/i],
  'text-[length:41rpx]': [/font-size\s*:\s*41rpx/i],
}
const markerClass = 'weapp-tw-dynamic-regression'
const scriptOnlyMarkerClass = 'weapp-tw-js-regression'
const habitMarkerClass = 'weapp-tw-habit-regression'
const scriptOnlyClassValue = `${scriptOnlyMarkerClass} ${scriptOnlyClasses.join(' ')}`
const habitBaseClassValue = `${habitMarkerClass} ${habitClasses[0]} ${habitClasses[1]}`
const habitArrayClassValue = `${habitClasses[2]} ${habitClasses[3]}`
const habitObjectClassValue = habitClasses[4]
const habitTemplateClassValue = habitClasses[5]
const habitConditionalClassValue = habitClasses[6]
const habitObjectDisabledClassValue = habitClasses[7]
const habitObjectEnabledClassValue = habitClasses[8]
const habitClassExpression = `['${habitBaseClassValue}', '${habitArrayClassValue}', true && '${habitConditionalClassValue}', { '${habitObjectClassValue}': true, '${habitObjectDisabledClassValue}': false, '${habitObjectEnabledClassValue}': true }, true ? \`${habitTemplateClassValue}\` : ''].map(item => typeof item === 'string' ? item : Object.entries(item).filter(([, enabled]) => enabled).map(([key]) => key).join(' ')).filter(Boolean).join(' ')`
const nativeElementRegressionVars = [
  '--weapp-tw-native-view-regression',
  '--weapp-tw-native-text-regression',
  '--weapp-tw-native-button-regression',
  '--weapp-tw-native-input-regression',
] as const
const nativeButtonAfterRegressionVar = '--weapp-tw-native-button-after-regression'
const localHBuilderXProjectNames = new Set(
  DEMO_COVERAGE_MATRIX
    .filter(item => item.hbuilderxLocal)
    .map(item => item.name),
)

interface PatchTarget {
  file: string
  transform: (source: string) => string
}

interface ProjectPatch {
  entry: ProjectEntry
  targets: PatchTarget[]
}

const changedFiles = new Map<string, string>()
const changedProjectRoots = new Set<string>()

function projectRoot(entry: ProjectEntry) {
  return path.resolve(fixturesRoot, entry.name)
}

function projectOutputRoot(entry: ProjectEntry) {
  return path.resolve(fixturesRoot, entry.projectPath, path.dirname(entry.cssFile))
}

function primaryCssFile(entry: ProjectEntry) {
  return path.resolve(fixturesRoot, entry.projectPath, entry.cssFile)
}

async function rememberOriginal(file: string) {
  if (changedFiles.has(file)) {
    return
  }
  changedFiles.set(file, await fs.readFile(file, 'utf8'))
}

async function writeFileAtomic(file: string, content: string) {
  const tmpFile = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  )
  await fs.writeFile(tmpFile, content, 'utf8')
  await fs.rename(tmpFile, file)
}

async function patchFile(target: PatchTarget) {
  await rememberOriginal(target.file)
  const source = await fs.readFile(target.file, 'utf8')
  const next = target.transform(source)
  if (next === source) {
    throw new Error(`Unable to patch regression fixture: ${target.file}`)
  }
  await writeFileAtomic(target.file, next)
}

async function restorePatchedFiles() {
  await Promise.all([...changedFiles].map(([file, source]) => writeFileAtomic(file, source)))
  changedFiles.clear()
}

async function cleanupPatchedProjects() {
  const roots = [...changedProjectRoots]
  changedProjectRoots.clear()
  await Promise.all(roots.map(root => clearProjectBuildState(root)))
}

function createNativePatch(entry: ProjectEntry): ProjectPatch {
  const root = projectRoot(entry)
  const pageFile = entry.name.startsWith('weapp-vite')
    ? path.resolve(root, 'pages/index/index.wxml')
    : path.resolve(root, 'src/pages/index/index.wxml')
  const styleFile = entry.name.startsWith('weapp-vite')
    ? path.resolve(root, 'pages/index/index.scss')
    : path.resolve(root, 'src/pages/index/index.scss')
  const pageMarker = entry.name === 'weapp-vite-tailwindcss-v4'
    ? '<view class="space-y-2.5">'
    : '<view class="{{contentStyle}}">'
  const inserted = `${pageMarker}\n  <view class="${markerClass} {{true?'h-[458rpx] w-[218rpx] inset-x-[30%]':''}}">dynamic regression</view>`
  const scriptFile = entry.name.startsWith('weapp-vite')
    ? path.resolve(root, 'pages/index/index.ts')
    : path.resolve(root, 'src/pages/index/index.ts')

  return {
    entry,
    targets: [
      {
        file: pageFile,
        transform: source => source.replace(pageMarker, inserted),
      },
      {
        file: styleFile,
        transform: source => prependOrAppendUserStyle(entry, source),
      },
      {
        file: pageFile,
        transform: source => source.replace('</view>', `  <view class="{{scriptOnlyClassName}}">script-only regression</view>\n  <view class="{{habitClassName}}">habit regression</view>\n</view>`),
      },
      {
        file: scriptFile,
        transform: source => source.replace(
          /data:\s*\{/,
          `data: {\n    scriptOnlyClassName: '${scriptOnlyClassValue}',\n    habitClassName: ${habitClassExpression},`,
        ),
      },
    ],
  }
}

function createMpxPatch(entry: ProjectEntry): ProjectPatch {
  const root = projectRoot(entry)
  const pageFile = path.resolve(root, 'src/pages/index.mpx')
  const pageMarker = entry.name.includes('-v4')
    ? '<view class="test">test</view>'
    : '<view wx:class="{{custom2}}"></view>'
  return {
    entry,
    targets: [
      {
        file: pageFile,
        transform: source => source.replace(pageMarker, `${pageMarker}\n    <view class="${markerClass}" wx:class="{{true ? 'h-[458rpx] w-[218rpx] inset-x-[30%]' : ''}}">dynamic regression</view>`),
      },
      {
        file: pageFile,
        transform: source => source.replace(pageMarker, `${pageMarker}\n    <view class="${scriptOnlyMarkerClass}" wx:class="{{scriptOnlyClassName}}">script-only regression</view>`),
      },
      {
        file: pageFile,
        transform: source => source.replace(pageMarker, `${pageMarker}\n    <view wx:class="{{habitClassName}}">habit regression</view>`),
      },
      {
        file: pageFile,
        transform: (source) => {
          const withConst = source.replace(
            'createPage({',
            `const habitClassName = ${habitClassExpression}\nconst scriptOnlyClassName = '${scriptOnlyClassValue}'\n\ncreatePage({`,
          )
          if (/data:\s*\{/.test(withConst)) {
            return withConst.replace(/data:\s*\{/, 'data: {\n    habitClassName,\n    scriptOnlyClassName,')
          }
          return withConst.replace('createPage({', 'createPage({\n  data: {\n    habitClassName,\n    scriptOnlyClassName,\n  },')
        },
      },
      {
        file: pageFile,
        transform: source => source.replace('</template>', `</template>\n\n<style>\n${createApplyStyle(entry)}</style>`),
      },
    ],
  }
}

function createTaroReactPatch(entry: ProjectEntry): ProjectPatch {
  const root = projectRoot(entry)
  const pageFile = path.resolve(root, 'src/pages/index/index.tsx')
  const styleExt = entry.name.includes('-v4') ? 'css' : 'scss'
  const styleFile = path.resolve(
    root,
    entry.name.startsWith('taro-vite-react-')
      ? `src/app.${styleExt}`
      : `src/pages/index/index.${styleExt}`,
  )
  const dynamicElement = `<View className={true ? '${markerClass} h-[458rpx] w-[218rpx] inset-x-[30%]' : markerClass}>dynamic regression</View>`
  const scriptOnlyElement = `<View className={scriptOnlyClassName}>script-only regression</View>`
  const habitElement = `<View className={habitClassName}>habit regression</View>`
  return {
    entry,
    targets: [
      {
        file: pageFile,
        transform: source => source.replace(
          /export default function Index\(\) \{\n|const Index = \(\) => \{\n/,
          match => `${match}  const habitClassName = ${habitClassExpression}\n  const scriptOnlyClassName = '${scriptOnlyClassValue}'\n`,
        ),
      },
      {
        file: pageFile,
        transform: (source) => {
          if (source.includes('return (\n    <>')) {
            return source.replace('return (\n    <>', `return (\n    <>\n      ${habitElement}\n      ${scriptOnlyElement}\n      ${dynamicElement}`)
          }
          return source.replace(/(<View(?:\s+className=['"][^'"]*['"])?\s*>)/, `$1\n      ${habitElement}\n      ${scriptOnlyElement}\n      ${dynamicElement}`)
        },
      },
      {
        file: styleFile,
        transform: source => prependOrAppendUserStyle(entry, source),
      },
    ],
  }
}

function createTaroVuePatch(entry: ProjectEntry): ProjectPatch {
  const root = projectRoot(entry)
  const pageFile = path.resolve(root, 'src/pages/index/index.vue')
  const externalStyleFile = path.resolve(root, 'src/pages/index/index.css')
  const source = fsSync.readFileSync(pageFile, 'utf8')
  const hasExternalStyle = source.includes('import \'./index.css\'') || source.includes('import "./index.css"')
  const styleTargets: PatchTarget[] = hasExternalStyle
    ? [
        {
          file: externalStyleFile,
          transform: source => prependOrAppendUserStyle(entry, source),
        },
      ]
    : [
        {
          file: pageFile,
          transform: (source) => {
            const styleBlockStart = /<style(?:\s[^>]*)?>\n/.exec(source)
            if (!styleBlockStart) {
              return `${source}\n<style>\n${createApplyStyle(entry)}</style>\n`
            }
            return source.replace(styleBlockStart[0], `${styleBlockStart[0]}${createApplyStyle(entry)}`)
          },
        },
      ]
  return {
    entry,
    targets: [
      {
        file: pageFile,
        transform: source => source.replace(
          /(<view(?:\s+class="[^"]*")?\s*>)/,
          `$1\n    <view :class="habitClassName">habit regression</view>\n    <view :class="scriptOnlyClassName">script-only regression</view>\n    <view class="${markerClass}" :class="true ? 'h-[458rpx] w-[218rpx] inset-x-[30%]' : ''">dynamic regression</view>`,
        ),
      },
      {
        file: pageFile,
        transform: source => source.replace(
          /<script setup lang="ts">\n/,
          `<script setup lang="ts">\nconst habitClassName = ${habitClassExpression}\nconst scriptOnlyClassName = '${scriptOnlyClassValue}'\n`,
        ),
      },
      ...styleTargets,
    ],
  }
}

function createUniAppPatch(entry: ProjectEntry): ProjectPatch {
  const root = projectRoot(entry)
  const pageFile = path.resolve(root, 'src/pages/index/index.vue')
  const rootMarker = entry.name.includes('-v4')
    ? '<view class="flex flex-col">'
    : '<view class="content"'
  const rootReplacement = entry.name.includes('-v4')
    ? `<view class="flex flex-col">\n    <view :class="habitClassName">habit regression</view>\n    <view :class="scriptOnlyClassName">script-only regression</view>\n    <view class="${markerClass}" :class="true ? 'h-[458rpx] w-[218rpx] inset-x-[30%]' : ''">dynamic regression</view>`
    : `<view :class="habitClassName">habit regression</view>\n  <view :class="scriptOnlyClassName">script-only regression</view>\n  <view class="${markerClass}" :class="true ? 'h-[458rpx] w-[218rpx] inset-x-[30%]' : ''">dynamic regression</view>\n  <view class="content"`
  return {
    entry,
    targets: [
      {
        file: pageFile,
        transform: source => source.replace(rootMarker, rootReplacement),
      },
      {
        file: pageFile,
        transform: source => source.replace('</script>', `</script>\n\n<style>\n${createApplyStyle(entry)}</style>`),
      },
      {
        file: pageFile,
        transform: source => source.replace(
          /<script setup lang="ts">\n/,
          `<script setup lang="ts">\nconst habitClassName = ${habitClassExpression}\nconst scriptOnlyClassName = '${scriptOnlyClassValue}'\n`,
        ),
      },
    ],
  }
}

function createApplyStyle(_entry: ProjectEntry) {
  return `.${markerClass} {\n  min-width: 0;\n}\nview {\n  box-sizing: border-box;\n  ${nativeElementRegressionVars[0]}: 1;\n}\ntext {\n  box-sizing: border-box;\n  ${nativeElementRegressionVars[1]}: 1;\n}\nbutton {\n  box-sizing: border-box;\n  ${nativeElementRegressionVars[2]}: 1;\n}\nbutton::after {\n  border: none;\n  ${nativeButtonAfterRegressionVar}: 1;\n}\ninput {\n  box-sizing: border-box;\n  ${nativeElementRegressionVars[3]}: 1;\n}\n`
}

function prependOrAppendUserStyle(entry: ProjectEntry, source: string) {
  const style = createApplyStyle(entry)
  if (!entry.name.includes('-v4')) {
    return `${style}${source}`
  }
  const customVariantEnd = source.lastIndexOf('}\n')
  if (customVariantEnd >= 0 && source.includes('@custom-variant')) {
    const insertAt = customVariantEnd + 2
    return `${source.slice(0, insertAt)}\n${style}${source.slice(insertAt)}`
  }
  const lastTailwindDirective = [...source.matchAll(/^@(import|config|source)[^;]*;\n/gm)].at(-1)
  if (lastTailwindDirective) {
    const insertAt = lastTailwindDirective.index + lastTailwindDirective[0].length
    return `${source.slice(0, insertAt)}${style}${source.slice(insertAt)}`
  }
  return `${style}${source}`
}

function createPatch(entry: ProjectEntry): ProjectPatch {
  if (entry.name.startsWith('gulp-') || entry.name.startsWith('weapp-vite-')) {
    return createNativePatch(entry)
  }
  if (entry.name.startsWith('mpx-')) {
    return createMpxPatch(entry)
  }
  if (entry.name.includes('-react-')) {
    return createTaroReactPatch(entry)
  }
  if (entry.name.startsWith('taro-') && entry.name.includes('-vue3-')) {
    return createTaroVuePatch(entry)
  }
  if (entry.name.startsWith('uni-app-')) {
    return createUniAppPatch(entry)
  }
  throw new Error(`Unsupported regression e2e project: ${entry.name}`)
}

async function applyPatch(projectPatch: ProjectPatch) {
  for (const target of projectPatch.targets) {
    await patchFile(target)
  }
}

async function readOutputFiles(entry: ProjectEntry) {
  const root = projectOutputRoot(entry)
  const files = await fs.readdir(root, { recursive: true, withFileTypes: true })
  const outputs: Array<{ name: string, content: string }> = []

  for (const file of files) {
    if (!file.isFile()) {
      continue
    }
    if (!/\.(?:wxml|axml|swan|ttml|qml|jxml|js|wxss|acss|ttss|qss|css)$/i.test(file.name)) {
      continue
    }
    outputs.push({
      name: file.name,
      content: await fs.readFile(path.resolve(file.parentPath, file.name), 'utf8'),
    })
  }

  return outputs
}

function expectBuiltRegression(entry: ProjectEntry, outputs: Array<{ name: string, content: string }>) {
  const joined = outputs.map(output => output.content).join('\n')
  const joinedWithoutTokenSourceComments = joinOutputsWithoutCssSourceTraces(outputs)
  const styles = outputs
    .filter(output => /\.(?:wxss|acss|ttss|qss|css)$/i.test(output.name))
    .map(output => output.content)
    .join('\n')
  const scripts = outputs
    .filter(output => /\.js$/i.test(output.name))
    .map(output => output.content)
    .join('\n')

  expect(joined, `${entry.name} should include regression marker`).toContain(markerClass)

  if (entry.name === 'weapp-vite-tailwindcss-v4') {
    expect(styles, `${entry.name} should emit the demo's flex layout styles`).toContain('.flex')
    expect(styles, `${entry.name} should emit the demo's gradient styles`).toContain('.bg-gradient-to-b')
  }
  else {
    expect(
      styles,
      `${entry.name} should keep the regression marker style`,
    ).toMatch(/\.weapp-tw-dynamic-regression\s*\{[^}]*min-width\s*:\s*0/)
  }
  for (const nativeElementRegressionVar of nativeElementRegressionVars) {
    expect(styles, `${entry.name} should preserve user-authored native element style ${nativeElementRegressionVar}`).toContain(nativeElementRegressionVar)
  }
  const nativeButtonAfterRule = [...styles.matchAll(/button::after\s*\{[^}]*\}/gi)]
    .map(match => match[0])
    .find(rule => rule.includes(nativeButtonAfterRegressionVar))
  expect(nativeButtonAfterRule, `${entry.name} should preserve the user-authored button::after selector`).toBeTruthy()
  expect(nativeButtonAfterRule, `${entry.name} button::after should preserve border:none`).toMatch(/border\s*:\s*none/i)
  expect(nativeButtonAfterRule, `${entry.name} button::after should preserve its regression marker`).toContain(nativeButtonAfterRegressionVar)

  for (const raw of rawClasses) {
    const escaped = replaceWxml(raw)
    expect(joined, `${entry.name} should escape ${raw}`).toContain(replaceWxml(raw))
    expect(joinedWithoutTokenSourceComments, `${entry.name} should not keep raw ${raw}`).not.toContain(raw)
    expect(styles, `${entry.name} should emit CSS selector for ${raw}`).toContain(escaped)
    for (const expectation of rawClassStyleExpectations[raw]) {
      expect(styles, `${entry.name} should emit generated CSS declaration for ${raw}`).toMatch(expectation)
    }
  }

  expect(joined, `${entry.name} should include script-only regression marker`).toContain(scriptOnlyMarkerClass)
  for (const raw of scriptOnlyClasses) {
    const escaped = replaceWxml(raw)
    expect(joined, `${entry.name} should escape script-only ${raw}`).toContain(escaped)
    expect(scripts, `${entry.name} should transform script-only ${raw} in JS output`).toContain(escaped)
    expect(joinedWithoutTokenSourceComments, `${entry.name} should not keep raw script-only ${raw}`).not.toContain(raw)
    expect(styles, `${entry.name} should emit CSS selector for script-only ${raw}`).toContain(escaped)
    for (const expectation of rawClassStyleExpectations[raw]) {
      expect(styles, `${entry.name} should emit generated CSS declaration for script-only ${raw}`).toMatch(expectation)
    }
  }

  expect(joined, `${entry.name} should include habit regression marker`).toContain(habitMarkerClass)
  for (const raw of habitClasses) {
    const escaped = replaceWxml(raw)
    expect(joined, `${entry.name} should escape habit ${raw}`).toContain(escaped)
    expect(scripts, `${entry.name} should transform habit ${raw} in JS output`).toContain(escaped)
    expect(joinedWithoutTokenSourceComments, `${entry.name} should not keep raw habit ${raw}`).not.toContain(raw)
    expect(styles, `${entry.name} should emit CSS selector for habit ${raw}`).toContain(escaped)
    for (const expectation of rawClassStyleExpectations[raw]) {
      expect(styles, `${entry.name} should emit generated CSS declaration for habit ${raw}`).toMatch(expectation)
    }
  }
}

function normalizeSelectorPart(part: string) {
  return part
    .trim()
    .replace(/:not\(#\\?#\)/g, '')
    .replace(/^:after$/, '::after')
    .replace(/^:before$/, '::before')
}

function countSelectorSetRules(css: string, selectorParts: string[]) {
  const expected = new Set(selectorParts)
  let count = 0
  const ruleRe = /([^{}@][^{}]*)\{/g
  let match = ruleRe.exec(css)
  while (match) {
    const selector = match[1]
    const parts = selector
      ?.split(',')
      .map(normalizeSelectorPart)
      .filter(Boolean)
    if (parts && parts.length === expected.size && parts.every(part => expected.has(part))) {
      count++
    }
    match = ruleRe.exec(css)
  }
  return count
}

function expectNoDuplicateMiniProgramPreflight(entry: ProjectEntry, appCss: string) {
  const basePreflightCount = countSelectorSetRules(appCss, ['view', 'text', '::after', '::before'])
  const rootPreflightCount = countSelectorSetRules(appCss, [':host', 'page', '.tw-root', 'wx-root-portal-content'])

  expect(basePreflightCount, `${entry.name} should not duplicate mini-program base preflight`).toBeLessThanOrEqual(1)
  expect(rootPreflightCount, `${entry.name} should not duplicate mini-program root preflight`).toBeLessThanOrEqual(1)
}

const regressionProjects = projectFilter(E2E_PROJECTS.filter(item => !localHBuilderXProjectNames.has(item.name)))

describe('all demo dynamic class regression', () => {
  afterEach(async () => {
    await restorePatchedFiles()
    await cleanupPatchedProjects()
  })

  if (regressionProjects.length === 0) {
    it.skip('当前项目过滤器没有匹配动态类回归项目', () => {})
  }

  for (const entry of regressionProjects) {
    it(entry.name, async () => {
      const patch = createPatch(entry)
      const root = projectRoot(entry)
      changedProjectRoots.add(root)
      await applyPatch(patch)
      await clearProjectBuildState(root)
      try {
        await ensureProjectBuilt(root, { force: true })
        expectBuiltRegression(entry, await readOutputFiles(entry))
        expectNoDuplicateMiniProgramPreflight(entry, await fs.readFile(primaryCssFile(entry), 'utf8'))
      }
      finally {
        await restorePatchedFiles()
        await cleanupPatchedProjects()
      }
    })
  }
})
