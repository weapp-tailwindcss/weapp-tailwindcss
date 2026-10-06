import path from 'node:path'
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss'
import { uniAppX } from '@/presets/uni-app-x'
import { retainUniAppXAuthorApplyCss } from '@/uni-app-x/vite/author-apply'

afterEach(() => vi.unstubAllEnvs())

it.each(['mp-weixin', 'web'])('真实 uniAppX preset 的 %s 局部样式保留运行时变量', async (platform) => {
  vi.stubEnv('UNI_PLATFORM', platform === 'web' ? 'h5' : platform)
  vi.stubEnv('UNI_UTS_PLATFORM', platform)
  const preset = uniAppX({ base: path.resolve(import.meta.dirname, '..', '..', '..'), componentLocalStyles: true })
  const handler = createStyleHandler({
    appType: preset.appType,
    uniAppX: preset.uniAppX.enabled,
    majorVersion: 4,
    cssPresetEnv: preset.cssPresetEnv,
    isMainChunk: false,
  })
  const input = ':root{--text-xs:24rpx;--text-xs--line-height:calc(1 / 0.75)}'
    + 'view,text{--tw-leading: }'
    + '.local{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}'
    + '.local{--tw-leading:2}'
    + '@media (min-width:1px){.local{--tw-leading:3}}'
  const generated = await handler(input)
  const retained = retainUniAppXAuthorApplyCss(generated.css, '.local{@apply text-xs}.local{--tw-leading:2}@media(min-width:1px){.local{--tw-leading:3}}')
  const replay = await handler(retained)
  const values: [string, string][] = []
  postcss.parse(replay.css).walkDecls((decl) => {
    values.push([decl.prop, decl.value])
  })
  expect(values).toContainEqual(['font-size', '24rpx'])
  expect(values).toContainEqual(['line-height', 'var(--tw-leading,var(--text-xs--line-height))'])
  expect(values).toContainEqual(['--tw-leading', '2'])
  expect(values).toContainEqual(['--tw-leading', '3'])
  const defaults: string[] = []
  postcss.parse(generated.css).walkRules('view,text', (rule) => {
    rule.walkDecls('--tw-leading', (decl) => {
      defaults.push(decl.value)
    })
  })
  expect(defaults).toEqual([' '])
  const main = await handler(input.replaceAll('.local', '.text-xs'), { isMainChunk: true })
  expect(main.css).toContain('line-height:var(--tw-leading,var(--text-xs--line-height))')
})
