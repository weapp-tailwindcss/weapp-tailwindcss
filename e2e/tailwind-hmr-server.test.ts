import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { withHmrServer } from './tailwind-capabilities/hmr/server'

it('Vite 的源码身份与真实临时目录一致，软链根目录不阻断模块或 CSS 加载', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const logs: string[] = []
  await withHmrServer(root, 'canonical-directory-test', logs, async ({ source, url, instance }) => {
    expect(path.dirname(source)).toBe(await realpath(path.dirname(source)))
    const [html, module, css] = await Promise.all([
      fetch(url),
      fetch(new URL('probe.js', url)),
      fetch(new URL('entry.css', url)),
    ])
    expect(html.status).toBe(200)
    expect(await html.text()).toContain(instance)
    expect(module.status).toBe(200)
    expect(await module.text()).toContain('canonical-directory-test/initial')
    expect(css.status).toBe(200)
    expect(await css.text()).toContain('80px')
  })
  expect(logs.filter(message => message.startsWith('error:'))).toEqual([])
}, 120_000)
