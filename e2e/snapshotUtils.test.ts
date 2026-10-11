import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../packages/weapp-tailwindcss/src/wxml'
import { collectCssSnapshots, formatRawCssSnapshotText, normalizeCssSnapshot, normalizeCssTextSnapshot, normalizeFontDataUrlsForSnapshot, normalizeFormattedCssSnapshot, normalizeGeneratedCssSourceMarkers, normalizeRawCssSnapshotText, normalizeSnapshotName } from './snapshotUtils'

describe('normalizeCssSnapshot', () => {
  it('normalizes generated css file hashes in path segments', () => {
    expect(normalizeSnapshotName('components/listb90661b8/index.wxss')).toBe('components/list/index.wxss')
    expect(normalizeSnapshotName('components/vant/weappda3e1e6c/lib/button/index.wxss')).toBe('components/vant/weapp/lib/button/index.wxss')
    expect(normalizeSnapshotName('styles/base3f288b8e.wxss')).toBe('styles/base.wxss')
  })

  it('normalizes generated css import hashes in raw snapshots', () => {
    expect(normalizeRawCssSnapshotText([
      '@import \'./styles/appb60826a4.wxss\';',
      '@import \'./styles/third-party-ui2633b7c4.wxss\';',
    ].join('\n'))).toBe([
      '@import \'./styles/app.wxss\';',
      '@import \'./styles/third-party-ui.wxss\';',
      '',
    ].join('\n'))
  })

  it('normalizes font data urls before formatting raw snapshots', async () => {
    expect(normalizeFontDataUrlsForSnapshot([
      '@font-face{font-family:nutui-iconfont;src:url(data:font/woff2;base64,d09GMgABAAAA) format("truetype")}',
      '@font-face{font-family:"JDZH-Bold";src:url("data:font/ttf;charset=utf-8;base64,AAEAAAALAIAAAwAw") format("truetype")}',
      '.logo{background-image:url(data:image/png;base64,iVBORw0KGgo=)}',
    ].join('\n'))).toBe([
      '@font-face{font-family:nutui-iconfont;src:url(data:font/woff2;base64,<stable>) format("truetype")}',
      '@font-face{font-family:"JDZH-Bold";src:url("data:font/ttf;base64,<stable>") format("truetype")}',
      '.logo{background-image:url(data:image/png;base64,iVBORw0KGgo=)}',
    ].join('\n'))

    await expect(formatRawCssSnapshotText([
      '@font-face{font-family:nutui-iconfont;src:url(data:font/woff2;base64,d09GMgABAAAA) format("truetype")}',
      '.bg-independent-subpackage-marker{background-color:#dc2626}',
    ].join('\n'))).resolves.toContain('url(data:font/woff2;base64,<stable>) format(\'truetype\')')
  })

  it.each(['', '-end'])('规范化跨工作树 CSS 来源标记 %s，保留起止边界与项目外来源', (suffix) => {
    for (const [root, file] of [
      ['/workspace/demo/app', '/workspace/demo/app/src/app.css'],
      ['C:\\workspace\\demo\\app', 'C:\\workspace\\demo\\app\\src\\app.css'],
      ['C:/workspace/demo/app', 'C:/workspace/demo/app/src/app.css'],
      ['\\\\server\\share\\app', '\\\\server\\share\\app\\src\\app.css'],
      ['C:\\', 'C:\\src\\app.css'],
      ['/', '/src/app.css'],
      ['demo/app', 'demo/app/src/app.css'],
    ]) {
      const source = `/*! weapp-tailwindcss vite-generated-css${suffix}:${encodeURIComponent(file!)} */`
      expect(normalizeGeneratedCssSourceMarkers(source, root!)).toBe(
        `/*! weapp-tailwindcss vite-generated-css${suffix}:%3Cproject-root%3E%2Fsrc%2Fapp.css */`,
      )
      expect(normalizeGeneratedCssSourceMarkers(source, '/other-project')).toBe(source)
    }
  })

  it.each([
    ['C:\\workspace', 'D:\\workspace\\src\\app.css'],
    ['C:\\', '/src/app.css'],
    ['/', 'C:\\src\\app.css'],
    ['/workspace/app', '/workspace/app-other/src/app.css'],
    ['C:\\workspace\\app', 'C:\\workspace\\app-other\\src\\app.css'],
  ])('保留项目外来源 %s → %s 的路径身份', (root, file) => {
    const marker = `/*! weapp-tailwindcss vite-generated-css:${encodeURIComponent(file)} */`
    expect(normalizeGeneratedCssSourceMarkers(marker, root)).toBe(marker)
  })

  it('normalizes generated css source markers through project aliases', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'generated-css-source-root-'))
    const alias = `${root}-alias`
    const sourceFile = path.join(root, 'App.uvue')
    await fs.writeFile(sourceFile, '<style />')
    await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir')

    try {
      const marker = `/*! weapp-tailwindcss vite-generated-css:${encodeURIComponent(path.join(alias, 'App.uvue'))} */`
      expect(normalizeGeneratedCssSourceMarkers(marker, root)).toBe(
        '/*! weapp-tailwindcss vite-generated-css:%3Cproject-root%3E%2FApp.uvue */',
      )
    }
    finally {
      await fs.rm(alias, { recursive: true, force: true })
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('normalizes cleaned HBuilderX project alias markers', () => {
    const sourceFile = path.join(
      tmpdir(),
      'weapp-tailwindcss-hbuilderx-projects',
      'uni-app-x-vdom-tailwindcss-v4-886dbfe1d9-26409',
      'App.uvue',
    )
    const marker = `/*! weapp-tailwindcss vite-generated-css:${encodeURIComponent(sourceFile)} */`

    expect(normalizeGeneratedCssSourceMarkers(marker, '/workspace/demo/uni-app-x-vdom-tailwindcss-v4')).toBe(
      '/*! weapp-tailwindcss vite-generated-css:%3Cproject-root%3E%2FApp.uvue */',
    )
  })

  it('falls back to PostCSS normalization for unsupported nested declaration blocks', async () => {
    const css = '@supports (color: color-mix(in lab,red,red)){{color:red}}'

    await expect(formatRawCssSnapshotText(css)).resolves.toBe(`${css}\n`)
  })

  it('applies webpack app split noise options to raw snapshots', () => {
    expect(normalizeRawCssSnapshotText([
      ':host,page,.tw-root,wx-root-portal-content{--font-sans:ui-sans-serif;--nut-icon-height:16rpx;--animate-duration:1s}',
      '.bg-independent-subpackage-marker{background-color:#dc2626}',
      '.nut-icon{width:16rpx;width:var(--nut-icon-width,16rpx)}',
      '.nut-icon-am-jump{animation-name:nutJumpOne}',
      '@keyframes nutJumpOne{50%{transform:translateY(-10rpx)}}',
    ].join('\n'), {
      normalizeWebpackAppSplitNoise: true,
    })).toBe([
      ':host, page, .tw-root, wx-root-portal-content{--font-sans:ui-sans-serif}',
      '.bg-independent-subpackage-marker{background-color:#dc2626}',
      '',
    ].join('\n'))
  })

  it('applies webpack app split noise options when collecting css snapshots', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'weapp-tw-css-snapshot-'))
    await fs.writeFile(path.join(root, 'app.wxss'), [
      ':host,page,.tw-root,wx-root-portal-content{--font-sans:ui-sans-serif;--nut-icon-height:16rpx;--animate-duration:1s}',
      '.nut-icon{width:16rpx;width:var(--nut-icon-width,16rpx)}',
      '.bg-independent-subpackage-marker{background-color:#dc2626}',
    ].join('\n'))

    const snapshots = await collectCssSnapshots(root, 'app.wxss', {
      normalizeWebpackAppSplitNoise: true,
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.content).toContain('.bg-independent-subpackage-marker')
    expect(snapshots[0]?.content).not.toContain('.nut-icon')
    expect(snapshots[0]?.content).not.toContain('--nut-icon-height')
  })

  it('normalizes formatted base selector spacing across platforms', () => {
    expect(normalizeFormattedCssSnapshot([
      '.bg-independent-subpackage-marker {',
      '  background-color: #dc2626;',
      '}',
      '',
      'view,',
      'text,',
      '::after,',
      '::before {',
      '  box-sizing: border-box;',
      '}',
      '',
      ':host,',
      'page,',
      '.tw-root,',
      'wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
    ].join('\n'))).toBe([
      '.bg-independent-subpackage-marker {',
      '  background-color: #dc2626;',
      '}',
      'view,',
      'text,',
      '::after,',
      '::before {',
      '  box-sizing: border-box;',
      '}',
      ':host,',
      'page,',
      '.tw-root,',
      'wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
    ].join('\n'))
  })

  it('normalizes token comment indentation inside nested rules', () => {
    expect(normalizeCssTextSnapshot([
      '@media (prefers-color-scheme: dark) {',
      '\t  /* tokens: system-dark:bg-slate-900 <= pages/index/index.wxml */',
      '    .system-dark_cbg-slate-900 { color: red; }',
      '  /* tokens: system-dark:text-slate-100 <= pages/index/index.wxml */',
      '    .system-dark_ctext-slate-100 { color: white; }',
      '}',
    ].join('\n'))).toBe([
      '@media (prefers-color-scheme: dark) {',
      ' /* tokens: system-dark:bg-slate-900 <= pages/index/index.wxml */',
      '    .system-dark_cbg-slate-900 { color: red; }',
      ' /* tokens: system-dark:text-slate-100 <= pages/index/index.wxml */',
      '    .system-dark_ctext-slate-100 { color: white; }',
      '}',
    ].join('\n'))
  })

  it('normalizes token comments that are formatted after a closing brace', () => {
    expect(normalizeFormattedCssSnapshot([
      '@media (prefers-color-scheme: dark) {',
      '  .system-dark_cbg-slate-900 {',
      '    background-color: #0f172a;',
      '  } /* tokens: system-dark:text-slate-100 <= src/pages/index/index.tsx */',
      '  .system-dark_ctext-slate-100 {',
      '    color: #f1f5f9;',
      '  }',
      '}',
    ].join('\n'))).toBe([
      '@media (prefers-color-scheme: dark) {',
      '  .system-dark_cbg-slate-900 {',
      '    background-color: #0f172a;',
      '  }',
      ' /* tokens: system-dark:text-slate-100 <= src/pages/index/index.tsx */',
      '  .system-dark_ctext-slate-100 {',
      '    color: #f1f5f9;',
      '  }',
      '}',
    ].join('\n'))
  })

  it('removes scanner noise utilities without a class list', () => {
    expect(normalizeCssSnapshot([
      ':host { --color-red-500: red; --spacing: 8rpx; }',
      '/*$vite$:1*/',
      '.start { left: var(--spacing); }',
      '.end { right: var(--spacing); }',
      '.border-bs { border-top-width: 1px; }',
      '.border-be { border-bottom-width: 1px; }',
      '.text-_b45rpx_B { font-size: 45rpx; }',
    ].join('\n'))).toBe([
      ':host { --spacing: 8rpx; }',
      '.text-_b45rpx_B { font-size: 45rpx; }',
    ].join('\n'))
  })

  it('removes scanner noise utilities even when class list contains them', () => {
    expect(normalizeCssSnapshot([
      ':host { --spacing: 8rpx; }',
      '/*$vite$:1*/',
      '.start { left: var(--spacing); }',
      '.end { right: var(--spacing); }',
      '.border-bs { border-top-width: 1px; }',
      '.border-be { border-bottom-width: 1px; }',
      '.text-_b45rpx_B { font-size: 45rpx; }',
    ].join('\n'), {
      classList: ['start', 'end', 'border-bs', 'border-be', 'text-_b45rpx_B'],
    })).toBe([
      ':host { --spacing: 8rpx; }',
      '.text-_b45rpx_B { font-size: 45rpx; }',
    ].join('\n'))
  })

  it('removes fallback declarations before equivalent var declarations', () => {
    expect(normalizeCssSnapshot([
      '.rounded-md {',
      '  border-radius: 12rpx;',
      '  border-radius: var(--radius-md);',
      '}',
      '.border-b-_b4rpx_B {',
      '  border-bottom-style: var(--tw-border-style);',
      '  border-bottom-width: 4rpx;',
      '}',
    ].join('\n'))).toBe([
      '.rounded-md {',
      '  border-radius: var(--radius-md);',
      '}',
      '.border-b-_b4rpx_B {',
      '  border-bottom-width: 4rpx;',
      '}',
    ].join('\n'))
  })

  it('normalizes calc wrapper and utility rule ordering differences', () => {
    expect(normalizeCssSnapshot([
      ':host { --spacing: 8rpx; --color-red-500: red; }',
      '.border-t-_b4px_B { border-top-width: 4px; }',
      '.border-_b_h098765_B { border-color: #098765; }',
      '.border-_b10rpx_B { border-width: 10rpx; }',
      '.border-_bred_B { border-color: red; }',
      '.border-b-_b4rpx_B { border-bottom-width: 4rpx; }',
      '.text-_b32px_B { font-size: 32px; }',
      '.text-_b32_d4rpx_B { font-size: 32.4rpx; }',
      '.text-_b32rpx_B { font-size: 32rpx; }',
      '.divide-x-8 {',
      '  border-left-width: calc(8rpx * calc(1 - var(--tw-divide-x-reverse)));',
      '  border-left-width: calc(8rpx * (1 - var(--tw-divide-x-reverse)));',
      '}',
    ].join('\n'))).toBe([
      ':host { --spacing: 8rpx; }',
      '.border-_b10rpx_B { border-width: 10rpx; }',
      '.border-_b_h098765_B { border-color: #098765; }',
      '.border-_bred_B { border-color: red; }',
      '.border-b-_b4rpx_B { border-bottom-width: 4rpx; }',
      '.border-t-_b4px_B { border-top-width: 4px; }',
      '.text-_b32_d4rpx_B { font-size: 32.4rpx; }',
      '.text-_b32px_B { font-size: 32px; }',
      '.text-_b32rpx_B { font-size: 32rpx; }',
      '.divide-x-8 {',
      '  border-left-width: calc(8rpx * (1 - var(--tw-divide-x-reverse)));',
      '}',
    ].join('\n'))
  })

  it('normalizes escaped arbitrary utility rule ordering without Tailwind CSS v4 markers', () => {
    expect(normalizeCssSnapshot([
      '.border-t-_b4px_B { border-top-width: 4px; }',
      '.border-_b_h098765_B { border-color: #098765; }',
      '.border-_b10rpx_B { border-width: 10rpx; }',
      '.border-_bred_B { border-color: red; }',
      '.border-b-_b4rpx_B { border-bottom-width: 4rpx; }',
      '.text-_b32px_B { font-size: 32px; }',
      '.text-_b32_d4rpx_B { font-size: 32.4rpx; }',
      '.text-_b32rpx_B { font-size: 32rpx; }',
    ].join('\n'))).toBe([
      '.border-_b10rpx_B { border-width: 10rpx; }',
      '.border-_b_h098765_B { border-color: #098765; }',
      '.border-_bred_B { border-color: red; }',
      '.border-b-_b4rpx_B { border-bottom-width: 4rpx; }',
      '.border-t-_b4px_B { border-top-width: 4px; }',
      '.text-_b32_d4rpx_B { font-size: 32.4rpx; }',
      '.text-_b32px_B { font-size: 32px; }',
      '.text-_b32rpx_B { font-size: 32rpx; }',
    ].join('\n'))
  })

  it('keeps escaped important text utilities inside the typography sort run', () => {
    expect(normalizeCssSnapshot([
      '.text-_b32px_B { font-size: 32px; }',
      '.leading-_b0_d9_B { line-height: 0.9; }',
      '._efont-bold { font-weight: var(--font-weight-bold) !important; }',
      '.text-_b32_d4rpx_B { font-size: 32.4rpx; }',
      '.text-_b32rpx_B { font-size: 32rpx; }',
      '._etext-_b_h990000_B { color: #990000 !important; }',
      '.text-_b_h5cdc34_B { color: #5cdc34; }',
    ].join('\n'))).toBe([
      '.text-_b32_d4rpx_B { font-size: 32.4rpx; }',
      '.text-_b32px_B { font-size: 32px; }',
      '.text-_b32rpx_B { font-size: 32rpx; }',
      '.leading-_b0_d9_B { line-height: 0.9; }',
      '._efont-bold { font-weight: var(--font-weight-bold) !important; }',
      '._etext-_b_h990000_B { color: #990000 !important; }',
      '.text-_b_h5cdc34_B { color: #5cdc34; }',
    ].join('\n'))
  })

  it('removes optional Tailwind CSS v4 root variable snapshot noise', () => {
    expect(normalizeCssSnapshot([
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --tw-rotate-x: initial;',
      '  --tw-gradient-position: initial;',
      '  --font-sans: ui-sans-serif;',
      '  --spacing: 8rpx;',
      '}',
      '::before, ::after {',
      '  --tw-content: "";',
      '}',
      '.bg-gradient-to-r {',
      '  --tw-gradient-position: to right in oklab;',
      '}',
    ].join('\n'), {
      normalizeTailwindV4RootVariableNoise: true,
    })).toBe([
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --font-sans: ui-sans-serif;',
      '  --spacing: 8rpx;',
      '}',
      '.bg-gradient-to-r {',
      '  --tw-gradient-position: to right in oklab;',
      '}',
    ].join('\n'))
  })

  it('keeps downgraded Tailwind CSS v4 gradient positions in snapshots', () => {
    expect(normalizeCssSnapshot([
      '.bg-gradient-to-r {',
      '  --tw-gradient-position: to right;',
      '}',
    ].join('\n'))).toBe([
      '.bg-gradient-to-r {',
      '  --tw-gradient-position: to right;',
      '}',
    ].join('\n'))
  })

  it('dedupes known Tailwind CSS v4 snapshot comments', () => {
    expect(normalizeCssSnapshot([
      '/* Core plugin extractor sources are intentionally not loaded here. */',
      '/* stylelint-disable custom-property-pattern */',
      '.layer-card-v4 { display: flex; }',
      '/* Core plugin extractor sources are intentionally not loaded here. */',
      '/* stylelint-disable custom-property-pattern */',
    ].join('\n'))).toBe([
      '/* Core plugin extractor sources are intentionally not loaded here. */',
      '/* stylelint-disable custom-property-pattern */',
      '.layer-card-v4 { display: flex; }',
    ].join('\n'))
  })

  it('annotates utility rules with extracted token source files', () => {
    expect(normalizeCssSnapshot([
      ':host { --spacing: 8rpx; }',
      '.h-14 { height: calc(var(--spacing) * 14); }',
      '.bg-_b_h123456_B { background-color: #123456; }',
    ].join('\n'), {
      tokenSources: new Map([
        ['h-14', { token: 'h-14', sources: ['src/pages/index/index.tsx'] }],
        [replaceWxml('bg-[#123456]'), { token: 'bg-[#123456]', sources: ['src/pages/index/index.tsx', 'src/theme.ts'] }],
      ]),
    })).toBe([
      ':host { --spacing: 8rpx; }',
      '/* tokens: h-14 <= src/pages/index/index.tsx */',
      '.h-14 { height: calc(var(--spacing) * 14); }',
      '/* tokens: bg-[#123456] <= src/pages/index/index.tsx, src/theme.ts */',
      '.bg-_b_h123456_B { background-color: #123456; }',
    ].join('\n'))
  })

  it('removes existing token comments with legacy spacing before re-annotating rules', () => {
    expect(normalizeCssSnapshot([
      '/*tokens: btn <= src/pages/index/daisyui.vue */',
      '/* tokens: relative <= src/components/TestCase55.vue */',
      '.btn { display: inline-flex; }',
      '.relative { position: relative; }',
    ].join('\n'), {
      tokenSources: new Map([
        ['btn', { token: 'btn', sources: ['src/pages/index/daisyui.vue'] }],
        ['relative', { token: 'relative', sources: ['src/components/TestCase55.vue'] }],
      ]),
    })).toBe([
      '/* tokens: btn <= src/pages/index/daisyui.vue */',
      '.btn { display: inline-flex; }',
      '/* tokens: relative <= src/components/TestCase55.vue */',
      '.relative { position: relative; }',
    ].join('\n'))
  })

  it('marks extracted tokens without source files as generated', () => {
    expect(normalizeCssSnapshot('.rotate-y-90 { transform: rotateY(90deg); }', {
      tokenSources: new Map([
        ['rotate-y-90', { token: 'rotate-y-90', sources: [] }],
      ]),
    })).toBe([
      '/* tokens: rotate-y-90 <= <tailwind generated> */',
      '.rotate-y-90 { transform: rotateY(90deg); }',
    ].join('\n'))
  })

  it('normalizes Tailwind CSS v4 default token output differences', () => {
    expect(normalizeCssSnapshot([
      ':host {',
      '  --spacing: 8rpx;',
      '  --color-gray-200: rgb(229, 231, 235);',
      '  --color-gray-400: rgb(153, 161, 175);',
      '  --blur: 8rpx;',
      '  --drop-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.1);',
      '  --radius: 8rpx;',
      '  --backdrop-blur: 8rpx;',
      '}',
      '.rounded {',
      '  border-radius: var(--radius);',
      '}',
      '.blur {',
      '  --tw-blur: blur(var(--blur));',
      '}',
      '.blur-emitted {',
      '  --tw-blur: blur(8rpx);',
      '}',
      '.shadow-sm {',
      '  --tw-shadow: 0 1px 2px 0 var(--tw-shadow-color, rgba(0, 0, 0, 0.05));',
      '}',
      '.shadow-sm-rpx {',
      '  --tw-shadow: 0 1rpx 3rpx 0 rgba(0, 0, 0, 0.10196), 0 1rpx 2rpx -1rpx rgba(0, 0, 0, 0.10196);',
      '}',
      '.drop-shadow {',
      '  --tw-drop-shadow: drop-shadow(var(--drop-shadow));',
      '}',
      '.drop-shadow-emitted {',
      '  --tw-drop-shadow: drop-shadow(0 1rpx 2rpx rgba(0, 0, 0, 0.1)) drop-shadow(0 1rpx 1rpx rgba(0, 0, 0, 0.06));',
      '}',
      '.backdrop-blur {',
      '  --tw-backdrop-blur: blur(var(--backdrop-blur));',
      '}',
      '.backdrop-blur-emitted {',
      '  --tw-backdrop-blur: blur(8rpx);',
      '}',
      '.outline {',
      '  outline-width: 3rpx;',
      '}',
      '.outline-px {',
      '  outline-width: 1rpx;',
      '}',
      '.ring {',
      '  --tw-ring-shadow: var(--tw-ring-inset,) 0 0 0 calc(3rpx + var(--tw-ring-offset-width)) var(--tw-ring-color, var(--color-blue-500, #3b82f6));',
      '}',
      '.ring-px {',
      '  --tw-ring-shadow: var(--tw-ring-inset,) 0 0 0 calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color, var(--color-blue-500, #3b82f6));',
      '}',
    ].join('\n'))).toBe([
      ':host {',
      '  --spacing: 8rpx;',
      '}',
      '.rounded {',
      '  border-radius: 8rpx;',
      '}',
      '.blur {',
      '  --tw-blur: blur(8px);',
      '}',
      '.blur-emitted {',
      '  --tw-blur: blur(8px);',
      '}',
      '.shadow-sm {',
      '  --tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgba(0, 0, 0, 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgba(0, 0, 0, 0.1));',
      '}',
      '.shadow-sm-rpx {',
      '  --tw-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);',
      '}',
      '.drop-shadow {',
      '  --tw-drop-shadow: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.06));',
      '}',
      '.drop-shadow-emitted {',
      '  --tw-drop-shadow: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.06));',
      '}',
      '.backdrop-blur {',
      '  --tw-backdrop-blur: blur(8px);',
      '}',
      '.backdrop-blur-emitted {',
      '  --tw-backdrop-blur: blur(8px);',
      '}',
      '.outline {',
      '  outline-width: 1px;',
      '}',
      '.outline-px {',
      '  outline-width: 1px;',
      '}',
      '.ring {',
      '  --tw-ring-shadow: var(--tw-ring-inset, ) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor);',
      '}',
      '.ring-px {',
      '  --tw-ring-shadow: var(--tw-ring-inset, ) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor);',
      '}',
    ].join('\n'))
  })

  it('normalizes Tailwind CSS v4 color output differences', () => {
    expect(normalizeCssSnapshot([
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --font-mono: ui-monospace;',
      '  --color-white: #fff;',
      '  --color-gray-100: #f3f4f6;',
      '  --color-blue-500: #3b82f6;',
      '  --color-red-500: #ef4444;',
      '  --color-brand: #155dfc;',
      '  --spacing: 8rpx;',
      '}',
      '.shadow {',
      '  --tw-shadow-color: var(--color-blue-500);',
      '}',
      '.ring {',
      '  --tw-ring-color: var(--color-cyan-500, #06b6d4);',
      '}',
      '.bg-blue-500_f30 {',
      '  background-color: rgba(59, 130, 246, 0.3);',
      '}',
      '.text-red-500 {',
      '  color: var(--color-red-500);',
      '}',
    ].join('\n'))).toBe([
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --font-mono: ui-monospace;',
      '  --color-red-500: rgb(251, 44, 54);',
      '  --color-brand: #155dfc;',
      '  --spacing: 8rpx;',
      '}',
      '.shadow {',
      '  --tw-shadow-color: var(--color-blue-500);',
      '}',
      '.ring {',
      '  --tw-ring-color: var(--color-cyan-500, #06b6d4);',
      '}',
      '.bg-blue-500_f30 {',
      '  background-color: rgba(50, 128, 255, 0.3);',
      '}',
      '.text-red-500 {',
      '  color: var(--color-red-500);',
      '}',
    ].join('\n'))
  })

  it('keeps Tailwind CSS v4 empty var fallback spaces for WeChat DevTools', () => {
    expect(normalizeCssSnapshot([
      ':host {',
      '  --spacing: 8rpx;',
      '}',
      '.rotate-y-90 {',
      '  --tw-rotate-y: rotateY(90deg);',
      '  transform: var(--tw-rotate-x,) var(--tw-rotate-y,) var(--tw-rotate-z,) var(--tw-skew-x,) var(--tw-skew-y,);',
      '  color: var(--app-color,);',
      '}',
    ].join('\n'))).toBe([
      ':host {',
      '  --spacing: 8rpx;',
      '}',
      '.rotate-y-90 {',
      '  --tw-rotate-y: rotateY(90deg);',
      '  transform: var(--tw-rotate-x, ) var(--tw-rotate-y, ) var(--tw-rotate-z, ) var(--tw-skew-x, ) var(--tw-skew-y, );',
      '  color: var(--app-color,);',
      '}',
    ].join('\n'))
  })

  it('normalizes webpack app root base split noise', () => {
    expect(normalizeCssSnapshot([
      '@font-face {',
      '  font-family: JDZH-Regular;',
      '  src: url(data:font/ttf;base64,regular) format("truetype");',
      '}',
      '@font-face {',
      '  font-family: "JDZH-Bold";',
      '  src: url(data:font/ttf;charset=utf-8;base64,bold) format("truetype");',
      '}',
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
      'view, text, ::after, ::before {',
      '  --tw-gradient-position: initial;',
      '  box-sizing: border-box;',
      '  border-width: 0;',
      '}',
      'view, text, ::after, ::before {',
      '  border: 0 solid;',
      '  box-sizing: border-box;',
      '  margin: 0;',
      '  padding: 0;',
      '}',
      '@-webkit-keyframes float-pop {',
      '  from { top: 0; }',
      '}',
      '@keyframes jump {',
      '  from { transform: none; }',
      '}',
      '@-webkit-keyframes nutFadeIn {',
      '  from { opacity: 0; }',
      '}',
      '@keyframes nutZoomOut {',
      '  to { opacity: 0; }',
      '}',
      '@-webkit-keyframes nutJump {',
      '  to { transform: translateY(-20rpx); }',
      '}',
      '@keyframes nutBounce {',
      '  50% { transform: scale(1.2); }',
      '}',
    ].join('\n'), {
      normalizeWebpackAppSplitNoise: true,
    })).toBe([
      '@font-face {',
      '  font-family: JDZH-Regular;',
      '  src: url(data:font/ttf;base64,<stable>) format("truetype");',
      '}',
      '@font-face {',
      '  font-family: "JDZH-Bold";',
      '  src: url(data:font/ttf;base64,<stable>) format("truetype");',
      '}',
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
      'view, text, ::after, ::before {',
      '  --tw-gradient-position: initial;',
      '  box-sizing: border-box;',
      '  border-width: 0;',
      '}',
      'view, text, ::after, ::before {',
      '  border: 0 solid;',
      '  box-sizing: border-box;',
      '  margin: 0;',
      '  padding: 0;',
      '}',
    ].join('\n'))
  })

  it('normalizes webpack app root rules with duplicated selectors', () => {
    expect(normalizeCssSnapshot([
      '@font-face {',
      '  font-family: JDZH-Regular;',
      '}',
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
      'page:not(#\\#), .tw-root:not(#\\#), wx-root-portal-content:not(#\\#), page:not(#\\#), :host:not(#\\#) {',
      '  --nutui-brand-1: #ffebf1;',
      '}',
      '.static {',
      '  position: static;',
      '}',
      '.h-14 {',
      '  height: calc(var(--spacing) * 14);',
      '}',
    ].join('\n'), {
      normalizeWebpackAppSplitNoise: true,
    })).toBe([
      '@font-face {',
      '  font-family: JDZH-Regular;',
      '}',
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '  --nutui-brand-1: #ffebf1;',
      '}',
      '.static {',
      '  position: static;',
      '}',
      '.h-14 {',
      '  height: calc(var(--spacing) * 14);',
      '}',
    ].join('\n'))
  })

  it('sorts subpackage marker chunks deterministically', () => {
    expect(normalizeCssSnapshot([
      'view,',
      'text,',
      '::before,',
      '::after {',
      '  --tw-content: "";',
      '}',
      '.bg-independent-subpackage-marker {',
      '  background-color: #dc2626;',
      '}',
      '.before_ccontent-_b_aindependent_subpackage_demo_a_B::before {',
      '  --tw-content: "independent";',
      '}',
      '.bg-normal-subpackage-marker {',
      '  background-color: #2563eb;',
      '}',
      '.before_ccontent-_b_anormal_subpackage_demo_a_B::before {',
      '  --tw-content: "normal";',
      '}',
    ].join('\n'))).toBe([
      'view,',
      'text,',
      '::before,',
      '::after {',
      '  --tw-content: "";',
      '}',
      '.before_ccontent-_b_aindependent_subpackage_demo_a_B::before {',
      '  --tw-content: "independent";',
      '}',
      '.before_ccontent-_b_anormal_subpackage_demo_a_B::before {',
      '  --tw-content: "normal";',
      '}',
      '.bg-independent-subpackage-marker {',
      '  background-color: #dc2626;',
      '}',
      '.bg-normal-subpackage-marker {',
      '  background-color: #2563eb;',
      '}',
    ].join('\n'))
  })

  it('keeps subpackage marker token comments attached while sorting chunks', () => {
    expect(normalizeCssSnapshot([
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
      '/* tokens: bg-independent-subpackage-marker <= src/sub-independent/pages/index.mpx */',
      '.bg-independent-subpackage-marker {',
      '  background-color: #dc2626;',
      '}',
      '/* tokens: before:content-[\'independent_subpackage_demo\'] <= src/sub-independent/pages/index.mpx */',
      '.before_ccontent-_b_aindependent_subpackage_demo_a_B::before {',
      '  --tw-content: "independent";',
      '}',
    ].join('\n'))).toBe([
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
      '/* tokens: before:content-[\'independent_subpackage_demo\'] <= src/sub-independent/pages/index.mpx */',
      '.before_ccontent-_b_aindependent_subpackage_demo_a_B::before {',
      '  --tw-content: "independent";',
      '}',
      '/* tokens: bg-independent-subpackage-marker <= src/sub-independent/pages/index.mpx */',
      '.bg-independent-subpackage-marker {',
      '  background-color: #dc2626;',
      '}',
    ].join('\n'))
  })

  it('keeps mini-program preflight reset when normalizing Taro webpack app split noise', () => {
    const css = normalizeCssSnapshot([
      '@font-face { font-family: "JDZH-Regular"; src: url(data:font/ttf;base64,abc) format("truetype"); }',
      'view, text, ::after, ::before {',
      '  box-sizing: border-box;',
      '  margin: 0;',
      '  padding: 0;',
      '  border: 0 solid;',
      '  --tw-rotate-x:;',
      '  --tw-gradient-position: initial;',
      '}',
      ':host, page, .tw-root, wx-root-portal-content {',
      '  --spacing: 8rpx;',
      '}',
    ].join('\n'), {
      normalizeWebpackAppSplitNoise: true,
    })

    expect(css).toContain('view, text, ::after, ::before {')
    expect(css).toContain('box-sizing: border-box;')
    expect(css).toContain('margin: 0;')
    expect(css).toContain('padding: 0;')
    expect(css).toContain('border: 0 solid;')
    expect(css).toContain('--tw-rotate-x:;')
    expect(css).toContain('--tw-gradient-position: initial;')
    expect(css).toContain(':host, page, .tw-root, wx-root-portal-content {')
    expect(css).toContain('--spacing: 8rpx;')
    expect(css.indexOf('view, text, ::after, ::before {')).toBeLessThan(css.indexOf('--tw-rotate-x:;'))
    expect(css.indexOf('--tw-gradient-position: initial;')).toBeLessThan(css.indexOf(':host, page, .tw-root, wx-root-portal-content {'))
  })
})
