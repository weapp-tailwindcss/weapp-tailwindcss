import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import htmlTransform from '@weapp-tailwindcss/postcss/html-transform'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import { replaceWxml } from '@/wxml/shared'

const variants = [
  {
    name: 'group variant without a redundant universal',
    utility: 'group-[:nth-of-type(3)_&]:block',
    rawClass: '.group-\\[\\:nth-of-type\\(3\\)_\\&\\]\\:block',
    selector: ':is(:nth-of-type(3) :where(.group) .group-\\[\\:nth-of-type\\(3\\)_\\&\\]\\:block)',
  },
  {
    name: 'group variant with an explicit universal',
    utility: 'group-[:nth-of-type(3)_&_*]:block',
    rawClass: '.group-\\[\\:nth-of-type\\(3\\)_\\&_\\*\\]\\:block',
    selector: ':where(.group) :is(view,text) .group-\\[\\:nth-of-type\\(3\\)_\\&_\\*\\]\\:block)',
  },
]

it.each(['weapp', 'alipay'].flatMap(platform => variants.map(variant => ({ ...variant, platform }))))('preserves $name through $platform framework PostCSS in a real Vite build', async ({ platform, utility, rawClass, selector }) => {
  const root = await mkdtemp(path.join(process.cwd(), '.tmp-vite-framework-universal-'))
  const cssFile = path.join(root, 'app.css')
  try {
    await writeFile(cssFile, '@import "tailwindcss" source(none);')
    await writeFile(path.join(root, 'main.ts'), `import './app.css'; const component = { className: ${JSON.stringify(utility)} }; console.log(component)`)
    let beforeFramework = ''
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      css: {
        postcss: {
          plugins: [
            {
              postcssPlugin: 'record-framework-input',
              Once(root) {
                beforeFramework = root.toString()
              },
            },
            htmlTransform({ platform, removeUniversal: true }),
          ],
        },
      },
      plugins: WeappTailwindcss({
        appType: 'taro',
        platform,
        cssEntries: [cssFile],
        tailwindcssBasedir: root,
      }),
      build: {
        write: false,
        minify: false,
        cssMinify: false,
        rollupOptions: { input: path.join(root, 'main.ts') },
      },
    })
    if (!('output' in result)) {
      throw new Error('预期单次 Vite 构建产物')
    }
    const css = result.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n')
    const js = result.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
    const escaped = replaceWxml(utility)
    // 框架收到的是原始 utility 身份与已准备的元素选择器，最终资产再执行类名转译。
    expect(beforeFramework).toContain(rawClass)
    expect(beforeFramework).toContain(selector)
    expect(css).toContain(`.${escaped}`)
    expect(css).toContain('display: block')
    expect(js).toContain(escaped)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
