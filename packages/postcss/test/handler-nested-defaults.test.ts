import { createStyleHandler } from '@/handler'

describe('nested style defaults', () => {
  it.each([undefined, { features: { 'color-mix': false } }])('retains safe defaults with a partial nested preset: %j', async (cssPresetEnv) => {
    const handler = createStyleHandler({
      cssOptions: { cssCalc: true, cssPreflight: false, cssPresetEnv },
    })
    const { css } = await handler(':root{--spacing:1rpx}.x{--icon:url(icon.svg);mask-image:var(--icon);width:calc(var(--spacing)*2)}')
    expect(css).toContain('width:2rpx')
    expect(css).toContain('mask-image:var(--icon)')
    expect(css).not.toContain('mask-image:url(')
  })

  it('retains explicit nested custom-property expansion', async () => {
    const handler = createStyleHandler({
      cssOptions: { cssPreflight: false, cssPresetEnv: { features: { 'custom-properties': { preserve: false } } } },
    })
    const { css } = await handler(':root{--color:red}.x{color:var(--color)}')
    expect(css).toContain('color:red')
    expect(css).not.toContain('var(--color)')
  })
})
