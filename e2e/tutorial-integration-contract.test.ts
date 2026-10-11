import fs from 'node:fs'
import path from 'pathe'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '..')

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8')
}

const frameworkTutorials = [
  {
    path: 'website/docs/quick-start/web.md',
    imports: ['import \'./style.css\''],
  },
  {
    path: 'website/docs/quick-start/frameworks/uni-app-vite.md',
    imports: ['@import "./app.css";'],
  },
  {
    path: 'website/docs/quick-start/frameworks/hbuilderx.md',
    imports: ['@import "./app.css";'],
  },
  {
    path: 'website/docs/quick-start/frameworks/uni-app-x.mdx',
    imports: ['@import \'./main.css\';'],
  },
  {
    path: 'website/docs/quick-start/frameworks/taro.md',
    imports: ['import \'./app.css\''],
  },
  {
    path: 'website/docs/quick-start/frameworks/mpx.mdx',
    imports: ['@import \'./app.css\';'],
  },
  {
    path: 'website/docs/quick-start/native/1.install-plugin.mdx',
    imports: ['入口 CSS 仍然要通过项目入口实际引入'],
  },
] as const

describe('website tutorial integration contract', () => {
  it.each(frameworkTutorials)('$path keeps its Tailwind css entry in the framework build graph', (item) => {
    const source = read(item.path)
    for (const expected of item.imports) {
      expect(source, `${item.path} should document ${expected}`).toContain(expected)
    }
  })

  it('keeps the uni-app x tutorial aligned with the verified demo', () => {
    const source = read('website/docs/quick-start/frameworks/uni-app-x.mdx')
    expect(source).toContain('@import \'./main.css\';')
    expect(source).toContain('rem2rpx: true')
    expect(source).not.toMatch(/cssOptions:\s*\{\s*rem2rpx:/)
    expect(source).not.toContain('href="https://github.com/icebreaker-template/uni-app-x-hbuilderx"')

    expect(read('demo/uni-app-x-vdom-tailwindcss-v4/App.uvue')).toContain('@import \'./main.css\';')
  })
})
