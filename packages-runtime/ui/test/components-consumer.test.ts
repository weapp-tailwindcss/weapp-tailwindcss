import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

it.each(['index.js', 'index.cjs'])('在 Taro 浏览器构建中消费组件产物 %s', async (filename) => {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  expect(manifest.repoctl.packageCheck.runtimeAssets).toEqual(['./components'])
  const result = await build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { createRoot } from 'react-dom/client'
        import { flushSync } from 'react-dom'
        import { ButtonTaro } from ${JSON.stringify(`./dist/components/${filename}`)}
        const root = createRoot(document.getElementById('root'))
        flushSync(() => root.render(createElement(ButtonTaro, {
          onClick: () => { document.body.dataset.clicked = 'yes' },
        }, '真实组件消费')))
      `,
      resolveDir: packageRoot,
      loader: 'js',
    },
    bundle: true,
    plugins: [{
      name: 'taro-react-components',
      setup(builder) {
        builder.onResolve({ filter: /^@tarojs\/components$/ }, () => ({ path: require.resolve('@tarojs/components/lib/react') }))
        builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path) }))
      },
    }],
    platform: 'browser',
    format: 'iife',
    write: false,
    metafile: true,
    // Taro 编译器提供环境与 DOM 可选能力开关；消费真实组件，不替换平台模块。
    define: {
      'process.env': JSON.stringify({ NODE_ENV: 'production', TARO_PLATFORM: 'web', TARO_ENV: 'h5', FRAMEWORK: 'react' }),
      'ENABLE_MUTATION_OBSERVER': 'false',
      'ENABLE_INNER_HTML': 'false',
      'ENABLE_ADJACENT_HTML': 'false',
      'ENABLE_CLONE_NODE': 'false',
      'ENABLE_CONTAINS': 'false',
      'ENABLE_SIZE_APIS': 'false',
      'ENABLE_TEMPLATE_CONTENT': 'false',
      'DEPRECATED_ADAPTER_COMPONENT': 'false',
    },
  })
  expect(Object.keys(result.metafile!.inputs).some(input => input.includes('@tarojs'))).toBe(true)
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', url: 'https://ui.example.test', pretendToBeVisual: true })
  try {
    dom.window.eval(result.outputFiles[0]!.text)
    const button = dom.window.document.querySelector('.wt-button')
    await new Promise<void>(resolve => dom.window.requestAnimationFrame(() => resolve()))
    expect(button?.localName).toBe('taro-view-core')
    expect(button?.textContent).toBe('真实组件消费')
    button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    expect(dom.window.document.body.dataset.clicked).toBe('yes')
  }
  finally {
    dom.window.close()
  }
})
