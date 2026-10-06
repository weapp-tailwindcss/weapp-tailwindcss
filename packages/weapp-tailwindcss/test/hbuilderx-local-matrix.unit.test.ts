import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

import { miniProgramCases, rawTailwindDirectiveRE, uniAppAppCases, uniAppXAppCases, uniAppXHBuilderXUnsupportedMiniProgramPlatforms, webCases } from '../../../e2e/hbuilderx-local/cases'
import { filterHBuilderXCases, matchesHBuilderXCaseFilter, parseCaseNameFilters } from '../../../e2e/hbuilderx-local/filters'
import { findHBuilderXAppTerminatedLog, findHBuilderXDeviceUnavailableLog } from '../../../e2e/hbuilderx-local/runner'
import { resolveExpectedMarkerTextColor } from '../../../scripts/demo-visual-e2e-report/app'

const hbuilderxDemoNames = [
  'issue-1144-uni-app-x-web',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
]
const hbuilderxMiniProgramCaseNames = [
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-alipay',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-baidu',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-toutiao',
  'uni-app-x-vdom-tailwindcss-v4',
]

function expectContainsMatcher(entries: Array<string | RegExp>, matcher: string | RegExp, message: string) {
  const ok = entries.some((entry) => {
    if (typeof matcher === 'string') {
      return typeof entry === 'string' && entry.includes(matcher)
    }
    return typeof entry === 'string' ? matcher.test(entry) : String(entry) === String(matcher)
  })

  expect(ok, message).toBe(true)
}

describe('HBuilderX local demo matrix', () => {
  it('distinguishes CSS directives from visible text mentioning @apply', () => {
    expect('@apply 多端写法示例').not.toMatch(rawTailwindDirectiveRE)
    expect('@apply flex items-center;').toMatch(rawTailwindDirectiveRE)
    expect('@theme static {').toMatch(rawTailwindDirectiveRE)
    expect('@import "tailwindcss";').toMatch(rawTailwindDirectiveRE)
  })

  it('fails fast when HBuilderX reports a missing device without exiting', () => {
    expect(findHBuilderXDeviceUnavailableLog('未检测到指定设备 emulator-5554')).toBe('未检测到指定设备')
    expect(findHBuilderXDeviceUnavailableLog('emulator-5556 offline')).toBe('emulator-5556 offline')
    expect(findHBuilderXDeviceUnavailableLog('项目编译成功')).toBeUndefined()
  })

  it('fails fast when HBuilderX stops an App build without exiting', () => {
    expect(findHBuilderXAppTerminatedLog('[plugin:uni:app-uts] 编译失败')).toBe('[plugin:uni:app-uts] 编译失败')
    expect(findHBuilderXAppTerminatedLog('运行包制作失败')).toBe('运行包制作失败')
    expect(findHBuilderXAppTerminatedLog('已停止运行...')).toBe('已停止运行')
    expect(findHBuilderXAppTerminatedLog('App Launch')).toBeUndefined()
  })

  it('keeps every HBuilderX demo covered by local mini-program and Web HMR cases', () => {
    expect(miniProgramCases.map(item => item.name)).toEqual(hbuilderxMiniProgramCaseNames)
    expect(webCases.map(item => item.name)).toEqual(hbuilderxDemoNames)

    for (const name of hbuilderxDemoNames) {
      const miniProgramCase = miniProgramCases.find(item => item.name === name && item.platform === 'mp-weixin')
      const webCase = webCases.find(item => item.name === name)

      if (miniProgramCase) {
        expect(miniProgramCase.workflow.staticTemplateClass, `${name} should cover template classes in mini-program output`).toBe(true)
        expect(miniProgramCase.workflow.subpackageStyle, `${name} should cover normal and independent subpackage styles`).toBe(true)
        expect(miniProgramCase.cssNotContains?.length, `${name} should reject leaked Tailwind directives`).toBeGreaterThan(0)
        expect(miniProgramCase.requiredFiles, `${name} should require normal subpackage output`).toContain('sub-normal/pages/index.json')
        expect(miniProgramCase.requiredFiles, `${name} should require independent subpackage output`).toContain('sub-independent/pages/index.json')
      }
      expect(webCase?.workflow.webHmr, `${name} should cover H5 dev HMR`).toBe(true)
      expect(webCase?.hmrSteps.length, `${name} should simulate multiple user edits during H5 dev`).toBeGreaterThanOrEqual(3)
      if (name === 'uni-app-x-vdom-tailwindcss-v4') {
        expect(webCase?.persistentRuntimeStyles?.map(item => item.selector)).toContain('.issue-1021-cell')
      }
      for (const step of webCase?.hmrSteps ?? []) {
        const themeColor = step.sourceMutation?.append?.match(/--color-([\w-]+)\s*:/)?.[1]
        const hasGeneratedBackground = step.markerClass.includes('bg-[#')
          || (themeColor !== undefined && step.markerClass.split(/\s+/).includes(`bg-${themeColor}`))
        expect(step.markerClass, `${name} HMR step should replace user-authored classes on one probe`).toContain('hbuilderx-web-hmr-probe')
        expect(hasGeneratedBackground, `${name} HMR step should cover an arbitrary or newly declared theme background`).toBe(true)
        expect(step.cssContains.length, `${name} HMR step should assert generated CSS`).toBeGreaterThanOrEqual(3)
        expect(step.runtimeStyles?.[0]?.selector, `${name} HMR step should assert the replaced probe at runtime`).toBe('.hbuilderx-web-hmr-probe')
      }
    }
  })

  it('keeps ordinary uni-app HBuilderX local mini-program coverage across supported non-WeChat platforms', () => {
    const ordinaryCases = miniProgramCases.filter(item => item.projectDir.includes('uni-app-vite-vue3-hbuilderx'))
    const casesByProject = new Map<string, typeof ordinaryCases>()

    for (const item of ordinaryCases) {
      casesByProject.set(item.projectDir, [...(casesByProject.get(item.projectDir) ?? []), item])
    }

    for (const [projectDir, cases] of casesByProject) {
      expect(cases.map(item => item.platform), `${projectDir} should cover HBuilderX mini-program platforms`).toEqual([
        'mp-weixin',
        'mp-alipay',
        'mp-baidu',
        'mp-toutiao',
      ])
      expect(cases.find(item => item.platform === 'mp-weixin')?.cssExtensions).toEqual(['.wxss'])
      expect(cases.find(item => item.platform === 'mp-alipay')?.cssExtensions).toEqual(['.acss'])
      expect(cases.find(item => item.platform === 'mp-baidu')?.cssExtensions).toEqual(['.css'])
      expect(cases.find(item => item.platform === 'mp-toutiao')?.cssExtensions).toEqual(['.ttss'])
      expect(cases.find(item => item.platform === 'mp-weixin')?.outputContains?.['sub-normal/pages/index.wxml']).toContain('bg-normal-subpackage-marker')
      expect(cases.find(item => item.platform === 'mp-alipay')?.outputContains?.['sub-normal/pages/index.axml']).toContain('bg-normal-subpackage-marker')
      expect(cases.find(item => item.platform === 'mp-baidu')?.outputContains?.['sub-normal/pages/index.swan']).toContain('bg-normal-subpackage-marker')
      expect(cases.find(item => item.platform === 'mp-toutiao')?.outputContains?.['sub-normal/pages/index.ttml']).toContain('bg-normal-subpackage-marker')
      expect(cases.find(item => item.platform === 'mp-weixin')?.outputContains?.['sub-independent/pages/index.wxml']).toContain('bg-independent-subpackage-marker')
      expect(cases.find(item => item.platform === 'mp-alipay')?.outputContains?.['sub-independent/pages/index.axml']).toContain('bg-independent-subpackage-marker')
      expect(cases.find(item => item.platform === 'mp-baidu')?.outputContains?.['sub-independent/pages/index.swan']).toContain('bg-independent-subpackage-marker')
      expect(cases.find(item => item.platform === 'mp-toutiao')?.outputContains?.['sub-independent/pages/index.ttml']).toContain('bg-independent-subpackage-marker')
    }
  })

  it('keeps uni-app-x HBuilderX coverage on supported targets and records upstream exclusions', () => {
    const uniAppXMiniProgramCases = miniProgramCases.filter(item => item.projectDir.includes('uni-app-x-vdom'))

    expect(uniAppXMiniProgramCases.map(item => item.platform)).toEqual([
      'mp-weixin',
    ])
    expect(uniAppXMiniProgramCases.map(item => item.cssExtensions)).toEqual([
      ['.wxss'],
    ])
    expect(uniAppXHBuilderXUnsupportedMiniProgramPlatforms).toEqual({
      'mp-alipay': expect.stringContaining('HBuilderX stable/alpha'),
      'mp-baidu': expect.stringContaining('HBuilderX stable/alpha'),
      'mp-toutiao': expect.stringContaining('HBuilderX stable/alpha'),
    })
  })

  it('keeps uni-app-x HBuilderX cases covering dynamic classes, user styles and component styles', () => {
    for (const name of hbuilderxDemoNames.filter(item => item.startsWith('uni-app-x-'))) {
      const miniProgramCase = miniProgramCases.find(item => item.name === name)
      const webCase = webCases.find(item => item.name === name)

      expect(miniProgramCase?.workflow.dynamicClassBinding, `${name} should cover dynamic :class bindings`).toBe(true)
      expect(miniProgramCase?.workflow.userAuthoredStyle, `${name} should cover user-authored style output`).toBe(true)
      expect(miniProgramCase?.workflow.thirdPartyOrExternalComponentStyle, `${name} should cover component/library style output`).toBe(true)
      expectContainsMatcher(miniProgramCase?.cssContains ?? [], '.bg-_b_h87add3_B', `${name} should keep component static style utilities`)
      expectContainsMatcher(miniProgramCase?.cssContains ?? [], '.bg-_b_hd2e252_B', `${name} should keep component dynamic style utilities`)
      expectContainsMatcher(miniProgramCase?.cssContains ?? [], '.text-_b93_d54rpx_B', `${name} should keep arbitrary dynamic text utilities`)
      expectContainsMatcher(miniProgramCase?.cssContains ?? [], '.bg-_b_hf21903_B', `${name} should keep page user-authored style utilities`)
      expectContainsMatcher(miniProgramCase?.cssContains ?? [], '.text-_b_hda0e3c_B', `${name} should keep page user-authored text utilities`)
      expectContainsMatcher(webCase?.initialCssContains ?? [], /background-color:\s*#f21903/, `${name} should verify generated H5 CSS from page user styles`)
      expect(miniProgramCase?.outputContains?.['app.json'], `${name} should verify subpackage registration`).toEqual([
        '"root": "sub-normal"',
        '"root": "sub-independent"',
        '"independent": true',
      ])
      expect(miniProgramCase?.outputContains?.['sub-normal/pages/index.wxml'], `${name} should verify normal subpackage marker`).toContain('bg-normal-subpackage-marker')
      expect(miniProgramCase?.outputContains?.['sub-independent/pages/index.wxml'], `${name} should verify independent subpackage marker`).toContain('bg-independent-subpackage-marker')
    }
  })

  it('touches the Tailwind root before adding utilities and declares named classes before use', () => {
    const androidCase = uniAppXAppCases.find(item => item.name === 'uni-app-x-vdom-tailwindcss-v4 android')
    const firstStep = androidCase?.hmrSteps?.[0]
    const namedClassStep = androidCase?.hmrSteps?.[1]

    expect(firstStep?.sourceMutation?.file).toBe('main.css')
    expect(firstStep?.sourceMutation?.touch).toBe(true)
    expect(firstStep?.markerClass).toContain('mt-200')
    expect(namedClassStep?.sourceMutation?.append).toContain('@theme static')
    expect(namedClassStep?.markerClass).toContain('bg-issue-1021-hmr')
  })

  it('keeps local App coverage explicit for supported HBuilderX demo platforms', () => {
    const appCaseNames = [...uniAppAppCases, ...uniAppXAppCases].map(item => item.name)

    expect(appCaseNames).toContain('uni-app-vite-vue3-hbuilderx-tailwindcss-v4 android')
    expect(appCaseNames).toContain('uni-app-vite-vue3-hbuilderx-tailwindcss-v4 ios')
    expect(appCaseNames).toContain('uni-app-x-vdom-tailwindcss-v4 android')
    expect(appCaseNames).toContain('uni-app-x-vdom-tailwindcss-v4 ios')
    expect(appCaseNames).toContain('uni-app-x-vdom-tailwindcss-v4 harmony')
  })

  it('validates Harmony styles from final compiled JavaScript instead of compiler intermediates', () => {
    const harmonyCase = uniAppXAppCases.find(item => item.platform === 'app-harmony')
    const harmonyPage = fs.readFileSync(new URL('../../../demo/uni-app-x-vdom-tailwindcss-v4/pages/index/index.uvue', import.meta.url), 'utf8')
    const compiledStyle = [
      '"issue-1002-apply":{"":{"borderTopLeftRadius":9999,"borderRadius":9999}}',
      '"wtu-rounded":{"":{"borderTopLeftRadius":9999,"borderRadius":9999}}',
    ].join(',')

    expect(harmonyCase?.styleOutputFiles).toBeUndefined()
    expect(harmonyCase?.styleContains).toBeUndefined()
    expect(harmonyCase?.compiledStyleContains?.length).toBeGreaterThanOrEqual(7)
    expect(harmonyCase?.markerClass).toContain('bg-[#68c828]')
    expect(harmonyCase?.transformedContains).toContain('"backgroundColor":"#68c828"')
    expect(harmonyPage.indexOf(harmonyCase?.markerAnchor ?? '')).toBeGreaterThan(harmonyPage.indexOf('<BindClass />'))
    for (const matcher of harmonyCase?.compiledStyleContains?.slice(0, 2) ?? []) {
      expect(compiledStyle).toMatch(matcher)
    }
    expectContainsMatcher(harmonyCase?.transformedNotContains ?? [], rawTailwindDirectiveRE, 'Harmony output should reject leaked Tailwind directives')
  })

  it('uses the final explicit marker text color for visual evidence', () => {
    expect(resolveExpectedMarkerTextColor('text-sm text-white')).toEqual({ blue: 255, green: 255, red: 255 })
    expect(resolveExpectedMarkerTextColor('text-sm text-white text-[#fef08a]')).toEqual({ blue: 138, green: 240, red: 254 })
    expect(resolveExpectedMarkerTextColor('text-sm')).toBeUndefined()
  })

  it('filters local HBuilderX e2e cases by demo name without requiring Vitest -t suffix matching', () => {
    const filters = parseCaseNameFilters('uni-app-x-vdom-tailwindcss-v4, uni-app-vite-vue3-hbuilderx-tailwindcss-v4')

    expect(matchesHBuilderXCaseFilter('uni-app-x-vdom-tailwindcss-v4 harmony', filters)).toBe(true)
    expect(matchesHBuilderXCaseFilter('uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-alipay', filters)).toBe(true)
    expect(matchesHBuilderXCaseFilter('uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-baidu', ['uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-alipay'])).toBe(false)
    expect(filterHBuilderXCases(miniProgramCases, filters).map(item => item.name)).toEqual([
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-alipay',
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-baidu',
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4 mp-toutiao',
      'uni-app-x-vdom-tailwindcss-v4',
    ])
  })
})
