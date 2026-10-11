import { readFile } from 'node:fs/promises'
import path from 'node:path'

describe('static CSS preset states', () => {
  it('includes first-frame styles for every theme transition preset', async () => {
    const css = await readFile(path.resolve(__dirname, '../css/index.css'), 'utf8')

    expect(css).toContain('[data-theme-transition-preset=\'circle\']')
    expect(css).toContain('[data-theme-transition-preset=\'fade\']')
    expect(css).toContain('[data-theme-transition-preset=\'wipe\']')
    expect(css).toContain('[data-theme-transition-preset=\'slide\']')
    expect(css).toContain('opacity: 0;')
    expect(css).toContain('clip-path: inset(0 0 0 100%);')
    expect(css).toContain('transform: translate3d(16px, 0, 0);')
  })
})
