import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { createPortAwareCommand, disableDevToolsCompileHotReload, miniProgramPageMatchesRoute, miniProgramProjectStartsAtRoute } from '../scripts/demo-visual-e2e-report/cases'
import { parseWechatDevToolsWindowBounds } from '../scripts/demo-visual-e2e-report/ide'
import { createHmrComparisons, mergeCaseResults } from '../scripts/demo-visual-e2e-report/report'
import { analyzeThemeCss, collectMiniProgramThemeScreenshotEvidence, countDarkPixels, countThemeColorPixels } from '../scripts/demo-visual-e2e-report/theme'
import { miniProgramCases, rawTailwindDirectiveRE, uniAppXAppCases, webCases } from './hbuilderx-local/cases'

describe('demo visual theme evidence', () => {
  it('uses each web case command and resolves its dynamic port', () => {
    expect(createPortAwareCommand(['exec', 'nuxt', 'dev', '--port', '{port}'], 4173)).toEqual([
      'exec',
      'nuxt',
      'dev',
      '--port',
      '4173',
    ])
    expect(createPortAwareCommand(['exec', 'vite'], 4173)).toEqual(['exec', 'vite', '--port', '4173'])
  })

  it('recognizes an already active mini-program route before reLaunch', () => {
    expect(miniProgramPageMatchesRoute({ path: 'pages/index/index' }, '/pages/index/index')).toBe(true)
    expect(miniProgramPageMatchesRoute({ path: '/pages/other/index' }, '/pages/index/index')).toBe(false)
    expect(miniProgramPageMatchesRoute({}, '/pages/index/index')).toBe(false)
  })

  it('uses the emitted app manifest as the initial mini-program route', async () => {
    const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'demo-visual-app-manifest-'))
    await fs.writeFile(path.join(projectRoot, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }))

    expect(await miniProgramProjectStartsAtRoute(projectRoot, '/pages/index/index')).toBe(true)
    expect(await miniProgramProjectStartsAtRoute(projectRoot, '/pages/other/index')).toBe(false)
    await fs.rm(projectRoot, { recursive: true, force: true })
  })

  it('validates the native DevTools window screenshot bounds', () => {
    expect(parseWechatDevToolsWindowBounds('10, 20, 1200, 800')).toBe('10,20,1200,800')
    expect(() => parseWechatDevToolsWindowBounds('10,20,0,800')).toThrow('窗口尺寸无效')
    expect(() => parseWechatDevToolsWindowBounds('not-bounds')).toThrow('无法解析')
  })

  it('keeps the uni-app x App entry valid for native App compilation', async () => {
    const files = [
      'demo/uni-app-x-vdom-tailwindcss-v4/App.uvue',
      'demo/uni-app-x-vdom-tailwindcss-v4/pages/index/index.uvue',
      'demo/uni-app-x-vdom-tailwindcss-v4/components/BindClass.uvue',
      'demo/uni-app-x-vdom-tailwindcss-v4/components/WeappTailwindcss.uvue',
      'demo/uni-app-x-vdom-tailwindcss-v4/components/a-navbar/a-navbar.uvue',
      'demo/uni-app-x-vdom-tailwindcss-v4/sub-normal/pages/index.uvue',
      'demo/uni-app-x-vdom-tailwindcss-v4/sub-independent/pages/index.uvue',
    ]
    for (const file of files) {
      const source = await fs.readFile(path.resolve(file), 'utf8')
      expect(source, file).toContain('<script lang="uts">')
      expect(source, file).not.toContain('<script setup')
    }
  })

  it('keeps the uni-app x navbar slot and custom class prop regression probe', async () => {
    const [component, page, config] = await Promise.all([
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/components/a-navbar/a-navbar.uvue'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/pages/index/index.uvue'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/vite.config.ts'), 'utf8'),
    ])

    expect(component).toContain('class="issue-navbar-side" :class="leftClass"')
    expect(component).toContain('<slot name="left" />')
    expect(page).toContain('leftClass="issue-navbar-left bg-primary w-[100rpx] h-[100rpx] px-[30rpx]"')
    expect(page).toContain('class="issue-navbar-image w-[100rpx] h-[100rpx] rounded-[10rpx]"')
    expect(page).toContain('<template #left>')
    expect(config).toContain('\'a-navbar\': [\'leftClass\', \'rightClass\']')
  })

  it('uses the issue #822 component-local style probe on every target without a manual isolation override', async () => {
    const android = uniAppXAppCases.find(item => item.platform === 'app-android')
    const ios = uniAppXAppCases.find(item => item.platform === 'app-ios')
    const harmony = uniAppXAppCases.find(item => item.platform === 'app-harmony')
    const miniProgram = miniProgramCases.find(item => item.name === 'uni-app-x-vdom-tailwindcss-v4')
    const web = webCases.find(item => item.name === 'uni-app-x-vdom-tailwindcss-v4')
    const component = await fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/components/BindClass.uvue'), 'utf8')

    expect(component).toContain('class="issue-822-component-child h-[200px] w-full bg-[#87add3]"')
    expect(component).toContain('class="text-[#111111]"')
    expect(component).toContain('.issue-822-component-child {')
    expect(component).toContain('border: 2px solid #7c3aed;')
    expect(component).not.toContain('styleIsolation: \'app\'')
    expect(android?.requiredFiles).toContain('App.uvue.ts')
    expect(android?.sourceFile).toBe('components/BindClass.uvue')
    expect(android?.transformedOutputFiles).toContain('components/BindClass.uvue.ts')
    expect(android?.compiledStyleContains?.some(item => item instanceof RegExp && item.source.includes('"issue-822-component-child"'))).toBe(true)
    expect(android?.compiledStyleContains?.some(item => item instanceof RegExp && item.source.includes('"borderTopStyle"') && item.source.includes('solid'))).toBe(true)
    expect(android?.compiledStyleContains?.some(item => item instanceof RegExp && item.source.includes('"borderTopColor"') && item.source.includes('#7c3aed'))).toBe(true)
    expect(ios?.sourceFile).toBe('components/BindClass.uvue')
    expect(ios?.markerAnchor).toBe('<text :class="flag')
    expect(ios?.transformedContains?.some(item => item instanceof RegExp && item.source.includes('"issue-822-component-child"'))).toBe(true)
    expect(ios?.transformedContains?.some(item => item instanceof RegExp && item.source.includes('"borderTopColor"') && item.source.includes('#7c3aed'))).toBe(true)
    expect(harmony?.requiredFiles).toContain('assets/components/BindClass.js')
    expect(harmony?.transformedOutputFiles).toContain('assets/components/BindClass.js')
    expect(harmony?.transformedContains?.some(item => item instanceof RegExp && item.source.includes('"issue-822-component-child"'))).toBe(true)
    expect(harmony?.transformedContains?.some(item => item instanceof RegExp && item.source.includes('"borderTopStyle"') && item.source.includes('solid'))).toBe(true)
    expect(harmony?.transformedContains?.some(item => item instanceof RegExp && item.source.includes('"borderTopColor"') && item.source.includes('#7c3aed'))).toBe(true)
    expect(miniProgram?.outputContains?.['components/BindClass.js']).toEqual(expect.arrayContaining(['__scopeId', 'data-v-']))
    expect(miniProgram?.outputContains?.['components/BindClass.wxml']).toEqual(expect.arrayContaining(['issue-822-component-child']))
    expect(miniProgram?.outputContains?.['components/BindClass.wxml']?.some(item => item instanceof RegExp && item.source.includes('data-v-'))).toBe(true)
    expect(web?.initialRuntimeStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        selector: '.issue-822-component-child',
        styles: expect.objectContaining({
          borderTopColor: 'rgb(124, 58, 237)',
          borderTopStyle: 'solid',
          borderTopWidth: '2px',
        }),
      }),
    ]))
  })

  it('keeps issue #1002 utilities in the uni-app x native runtime probes', async () => {
    const [component, mainCss, page] = await Promise.all([
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/components/BindClass.uvue'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/main.css'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/pages/index/index.uvue'), 'utf8'),
    ])

    for (const utility of ['text-xs', 'text-sm', 'text-base', 'text-xl', 'text-white', 'rounded-full']) {
      expect(page, `issue #1002 probe should include ${utility}`).toContain(utility)
    }
    expect(page).toContain('@apply text-xs text-white rounded-full bg-[#164e63];')
    for (const hmrOnlyUtility of ['bg-[#3b0764]', 'text-blue-600', 'text-bule-600', 'bg-[#0f766e]', 'text-[#facc15]']) {
      expect(mainCss, `HMR utility ${hmrOnlyUtility} must not be pre-seeded`).not.toContain(hmrOnlyUtility)
    }
    expect(component).not.toContain('text-blue-600/50')
    expect(mainCss).not.toContain('text-blue-600/50')
    expect(page).not.toContain('text-blue-600/50')

    const issue1002AppCases = uniAppXAppCases.filter(
      item => item.projectDir === 'demo/uni-app-x-vdom-tailwindcss-v4',
    )
    for (const item of issue1002AppCases) {
      if (item.platform === 'app-android') {
        expect(item.markerClass).toContain('rounded-[9998px]')
        expect(item.markerTextClass).toContain('text-[39rpx]')
        expect(item.markerTextClass).toContain('text-[#f7fbff]')
        expect(item.hmrMarkerClass).toContain('rounded-[9997px]')
        expect(item.hmrMarkerTextClass).toContain('text-[28rpx]')
        expect(item.hmrMarkerTextClass).toContain('text-blue-600')
        expect(item.hmrMarkerTextClass).toContain('text-bule-600')
        expect(item.hmrSteps?.map(step => step.name)).toEqual([
          'append-mt-200-to-existing-node',
          'new-named-and-invalid-class',
          'replace-with-new-arbitrary-classes',
          'arbitrary-background-and-color-opacity',
          'delete-new-classes',
          'rollback-to-first-new-classes',
        ])
        expect(item.hmrSteps?.[0]?.markerClass).toContain('mt-200')
        expect(item.hmrSteps?.[1]?.markerClass).toContain('bg-issue-1021-hmr')
        expect(item.hmrSteps?.[2]?.markerClass).toContain('bg-[#0f766e]')
        expect(item.hmrSteps?.[3]?.markerClass).toContain('bg-[#123456]')
        expect(item.hmrSteps?.[3]?.markerTextClass).toContain('text-blue-600/50')
        expect(item.hmrSteps?.[4]?.transformedNotContains).toContainEqual(/\["color", "rgba\(21,\s*93,\s*252,\s*0\.5\)"\]/)
        expect(item.hmrSteps?.[5]?.markerTextClass).toContain('text-blue-600')
      }
      else {
        expect(item.markerClass).toContain('rounded-full')
        expect(item.markerTextClass).toContain('text-xl')
        expect(item.markerTextClass).toContain('text-white')
        expect(item.hmrMarkerTextClass).toContain('text-sm')
        expect(item.hmrMarkerTextClass).toContain('text-white')
      }
      expect([
        ...(item.transformedNotContains ?? []),
        ...(item.styleNotContains ?? []),
      ]).toEqual(expect.arrayContaining([
        '.tw-root',
        'calc(infinity',
      ]))
      if (item.platform === 'app-android') {
        expect(item.compiledStyleContains?.length).toBeGreaterThanOrEqual(8)
        expect(item.transformedNotContains).toContain(rawTailwindDirectiveRE)
        expect(item.transformedNotContains).toContainEqual(/@[\w-][^;{}]*\{\s*\}/)
      }
      expect(item.logNotContains?.length).toBeGreaterThan(0)
    }
  })

  it('keeps uview-ultra and z-paging scoped author css probes intact', async () => {
    const [button, paging] = await Promise.all([
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/components/issue-1019-button/issue-1019-button.uvue'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/components/z-paging-probe/z-paging-probe.uvue'), 'utf8'),
    ])

    for (const source of [button, paging]) {
      expect(source).toContain('transition-property: transform, opacity;')
      expect(source).toContain('-webkit-transform: translate(0px, 0px);')
      expect(source).toContain('transform: translate(0px, 0px);')
    }
    expect(button).toContain('&:is(.up-button--primary, .is-ready)')
    expect(button).toContain('var(--issue-1019-primary, #0957de)')
    expect(paging).toContain(':deep(.z-paging__content)')
    expect(paging).toContain('var(--z-paging-background, #ecfeff)')
  })

  it('does not pin Harmony visual coverage to a machine-specific device', () => {
    const harmony = uniAppXAppCases.find(item => item.platform === 'app-harmony')
    if (!process.env['E2E_HBUILDERX_HARMONY_DEVICE_ID'] && !process.env['DEMO_VISUAL_HARMONY_DEVICE_ID']) {
      expect(harmony?.launchArgs).toEqual([])
    }
  })

  it('keeps issue #822 component-local styles enabled for both isolation versions', async () => {
    const config = await fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/vite.config.ts'), 'utf8')
    expect(config).toContain('uniAppX({')
    expect(config).toContain('componentLocalStyles: {')
    expect(config).toContain('enabled: true')
    expect(config).toContain('onlyWhenStyleIsolationVersion2: false')
  })

  it('keeps native App builds outside the Iconify CSS module graph', async () => {
    const [app, config, iconify] = await Promise.all([
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/App.uvue'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/vite.config.ts'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/main.iconify.css'), 'utf8'),
    ])
    expect(app).toContain('/*  #ifndef  APP  */\n@import \'./main.iconify.css\';\n/*  #endif  */')
    expect(config).toContain('process.env.UNI_UTS_PLATFORM?.startsWith(\'app-\')')
    expect(config).toContain('...isNativeApp ? [] : [resolve(projectRoot, \'main.iconify.css\')]')
    expect(iconify).toContain('@reference "./main.css";')
    expect(iconify).toContain('i-[mdi--github-circle]')
    expect(iconify).toContain('i-[svg-spinners--180-ring-with-bg]')
  })

  it('detects system and manual dark mode selectors in mini-program css output', () => {
    const css = [
      '@media (prefers-color-scheme: dark) { .system-dark_cbg-slate-900 { background-color: #0f172a; } }',
      '.theme-dark .dark_cbg-zinc-950 { background-color: #09090b; }',
    ].join('\n')

    expect(analyzeThemeCss(css)).toEqual({
      hasManualDarkSelector: true,
      hasUnsupportedThemeAttributeSelector: false,
      hasUnsupportedThemeComplexSelector: false,
      hasSystemDarkMedia: true,
    })
  })

  it('rejects mini-program unsupported attribute and complex selectors', () => {
    expect(analyzeThemeCss('.theme-dark [disabled] { opacity: .5 }').hasUnsupportedThemeAttributeSelector).toBe(true)
    expect(analyzeThemeCss('.dark_cbg-zinc-900:not(view):not(text) { background: #000 }').hasUnsupportedThemeComplexSelector).toBe(true)
    expect(analyzeThemeCss('.theme-dark:where(.active, .current) { color: #fff }').hasUnsupportedThemeComplexSelector).toBe(true)
    expect(analyzeThemeCss('.t-button__content:not(:empty) { display: inline }').hasUnsupportedThemeComplexSelector).toBe(false)
  })

  it('keeps third-party attribute selectors outside theme selector checks', () => {
    const evidence = analyzeThemeCss(`.nut-rtl .nut-toast,
[dir='rtl'] .nut-toast {
  left: auto;
  right: 0;
}
.theme-dark .dark_cbg-zinc-950 {
  background-color: #09090b;
}`)
    expect(evidence.hasManualDarkSelector).toBe(true)
    expect(evidence.hasUnsupportedThemeAttributeSelector).toBe(false)
    expect(evidence.hasUnsupportedThemeComplexSelector).toBe(false)
  })

  it('counts dark pixels inside the sampled screenshot rectangle', () => {
    const png = new PNG({ height: 4, width: 4 })
    png.data.fill(255)
    for (let y = 1; y <= 2; y++) {
      for (let x = 1; x <= 2; x++) {
        const index = (png.width * y + x) * 4
        png.data[index] = 9
        png.data[index + 1] = 9
        png.data[index + 2] = 11
        png.data[index + 3] = 255
      }
    }

    expect(countDarkPixels(png, { height: 2, left: 1, top: 1, width: 2 })).toBe(4)
    expect(countDarkPixels(png, { height: 1, left: 0, top: 0, width: 1 })).toBe(0)
  })

  it('temporarily disables DevTools auto reload and restores the exact config', async () => {
    const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'demo-visual-project-config-'))
    const projectConfigFile = path.join(projectRoot, 'project.config.json')
    const source = '{\n  "setting": {\n    "compileHotReLoad": true\n  }\n}'
    await fs.writeFile(projectConfigFile, source)

    const restore = await disableDevToolsCompileHotReload(projectRoot)
    expect(JSON.parse(await fs.readFile(projectConfigFile, 'utf8')).setting.compileHotReLoad).toBe(false)

    await restore()
    expect(await fs.readFile(projectConfigFile, 'utf8')).toBe(source)
    await fs.rm(projectRoot, { recursive: true, force: true })
  })

  it('merges platform reports while replacing the current case result', () => {
    const previous = [
      { name: 'demo-a', platform: 'h5', status: 'failed' as const },
      { name: 'demo-a', platform: 'weapp', status: 'passed' as const },
    ]
    const current = [
      { name: 'demo-a', platform: 'h5', status: 'passed' as const },
      { name: 'demo-b', platform: 'app-android', status: 'passed' as const },
    ]

    expect(mergeCaseResults(previous, current)).toEqual([
      { name: 'demo-a', platform: 'h5', status: 'passed' },
      { name: 'demo-a', platform: 'weapp', status: 'passed' },
      { name: 'demo-b', platform: 'app-android', status: 'passed' },
    ])
  })

  it('keeps incremental report generation working when previous screenshots are absent', () => {
    const results = [{
      hmrAfterScreenshot: '/missing/after.png',
      hmrBeforeScreenshot: '/missing/before.png',
      hmrSteps: [{
        afterScreenshot: '/missing/step-after.png',
        beforeScreenshot: '/missing/step-before.png',
        name: 'background',
      }],
      name: 'demo-a',
      platform: 'weapp' as const,
      status: 'passed' as const,
    }]

    expect(() => createHmrComparisons(results, {
      artifactRoot: '/missing/artifacts',
    } as never)).not.toThrow()
    expect(results[0].status).toBe('passed')
  })

  it('fails cross-platform comparisons above the configured ratio limit', async () => {
    const artifactRoot = await fs.mkdtemp(path.join(tmpdir(), 'demo-visual-diff-limit-'))
    const width = 390
    const height = 844
    const createImage = (value: number) => {
      const png = new PNG({ width, height })
      png.data.fill(value)
      return png
    }
    const h5 = path.join(artifactRoot, 'h5.png')
    const harmony = path.join(artifactRoot, 'harmony.png')
    await fs.writeFile(h5, PNG.sync.write(createImage(0)))
    await fs.writeFile(harmony, PNG.sync.write(createImage(255)))
    const results = [
      { name: 'demo', platform: 'h5' as const, status: 'passed' as const, screenshot: h5 },
      { name: 'demo', platform: 'app-harmony' as const, status: 'passed' as const, screenshot: harmony },
    ]

    const { createCrossPlatformComparisons } = await import('../scripts/demo-visual-e2e-report/report')
    createCrossPlatformComparisons(results, {
      artifactRoot,
      viewport: { width, height },
      maxCrossPlatformDiffRatio: 0.05,
    } as never)

    expect(results[0].status).toBe('failed')
    expect(results[1].status).toBe('failed')
    expect(results[1].error).toContain('超过上限 0.05')
    expect(results[1].comparison).toMatchObject({
      maxRatio: 0.05,
      target: 'h5',
      withinLimit: false,
    })
    await fs.rm(artifactRoot, { recursive: true, force: true })
  })
})

describe('theme screenshot evidence boundaries', () => {
  it('does not use unrelated dark pixels to pass a missing target background', async () => {
    const png = new PNG({ width: 100, height: 200 })
    for (let index = 0; index < png.data.length; index += 4) {
      png.data.set([255, 255, 255, 255], index)
    }
    for (let y = 100; y < 200; y++) {
      for (let x = 0; x < 100; x++) {
        png.data.set([0, 0, 0, 255], (y * 100 + x) * 4)
      }
    }
    const node = {
      offset: async () => ({ left: 10, top: 10 }),
      size: async () => ({ width: 60, height: 60 }),
    }
    const page = { size: async () => ({ width: 100, height: 800 }), $: async () => node }
    await expect(collectMiniProgramThemeScreenshotEvidence(page, png)).rejects.toThrow('暗色像素不足')
  })
})

describe('explicit theme fixture colors', () => {
  it('matches the configured blue fixture and rejects a dark substitute', () => {
    const png = new PNG({ width: 10, height: 10 })
    for (let offset = 0; offset < png.data.length; offset += 4) {
      png.data.set([52, 152, 219, 255], offset)
    }
    const rect = { left: 0, top: 0, width: 10, height: 10 }
    expect(countThemeColorPixels(png, rect, [52, 152, 219])).toBe(100)
    expect(countThemeColorPixels(png, rect, [9, 9, 11])).toBe(0)
  })
})
