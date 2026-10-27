import type { OutputBundle } from 'rollup'
import { describe, expect, it } from 'vitest'
import { createFrameworkAssetAccess } from '@/bundlers/vite/shared/framework-assets'

function createBundle(): OutputBundle {
  return {
    'styles/main.css': { type: 'asset', fileName: 'styles/main.css', names: [], originalFileNames: [], source: '.initial{}' },
    'entry.js': {
      type: 'chunk', fileName: 'entry.js', code: 'initial()',
      map: { sourcesContent: ['source'] },
      viteMetadata: { importedCss: new Set(['styles/main.css']) },
    },
  } as unknown as OutputBundle
}

describe('framework asset access', () => {
  it('isolates nested asset views from the bundler graph', () => {
    const bundle = createBundle()
    const access = createFrameworkAssetAccess(bundle)
    const view = access.read()
    expect(Object.isFrozen(view)).toBe(true)
    expect(() => { (view['styles/main.css'] as any).source = 'wrong' }).toThrow()
    const chunk = view['entry.js']!
    if (chunk.type !== 'chunk') {
      throw new Error('Expected chunk')
    }
    expect(() => { (chunk.map!.sourcesContent as string[]).push('wrong') }).toThrow()
    expect(() => { (chunk.viteMetadata.importedCss as string[]).push('wrong.css') }).toThrow()
    expect((bundle['styles/main.css'] as any).source).toBe('.initial{}')
    expect((bundle['entry.js'] as any).viteMetadata.importedCss).toEqual(new Set(['styles/main.css']))
  })

  it('commits explicit updates and deletion to only the owning build', () => {
    const first = createBundle()
    const second = createBundle()
    const access = createFrameworkAssetAccess(first)
    access.replaceText('entry.js', 'updated()')
    access.replaceText('styles/main.css', '.updated{}')
    access.emit('styles/extra.css', '.extra{}')
    expect(() => access.emit('styles/main.css', 'overwrite')).toThrow('不能覆盖')
    access.remove('styles/extra.css')
    expect(() => access.replaceText('styles/extra.css', 'missing')).toThrow('不存在')
    expect((first['entry.js'] as any).code).toBe('updated()')
    expect(first['styles/extra.css']).toBeUndefined()
    expect((second['entry.js'] as any).code).toBe('initial()')
    expect((second['styles/main.css'] as any).source).toBe('.initial{}')
  })

  it('decodes byte assets and does not inspect unrelated chunk code', () => {
    const bundle = createBundle()
    ;(bundle['styles/main.css'] as any).source = new TextEncoder().encode('/* 中文 */')
    Object.defineProperty(bundle['entry.js'], 'code', { get() { throw new Error('Unrelated script') } })
    const view = createFrameworkAssetAccess(bundle).read()
    expect((view['styles/main.css'] as any).source).toBe('/* 中文 */')
  })
})
