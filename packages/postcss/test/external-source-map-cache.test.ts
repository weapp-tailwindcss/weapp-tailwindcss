import type { ProcessOptions } from 'postcss'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '../src/handler'

const css = '.a{color:red}'
const mappedCss = `${css}\n/*# sourceMappingURL=input.css.map */`

function previousMap(source: string) {
  return {
    version: 3,
    file: 'input.css',
    sources: [`${source}.scss`],
    sourcesContent: [`$color: ${source};`],
    names: [],
    mappings: 'AAAA',
  }
}

function createHandler(options: ProcessOptions) {
  const onDiagnostic = vi.fn()
  const handler = createStyleHandler({
    cssPreflight: false,
    onDiagnostic,
    postcssOptions: { options },
  })
  return { handler, onDiagnostic }
}

describe('自动外部 source map 的结果缓存边界', () => {
  for (const map of [undefined, true, {}, { prev: '' }, { inline: false, annotation: false }] as const) {
    it(`同路径 map 字节变化后读取本轮来源，map=${JSON.stringify(map) ?? 'default'}`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
      try {
        const mapFile = path.join(directory, 'input.css.map')
        const options: ProcessOptions = {
          from: path.join(directory, 'input.css'),
          to: path.join(directory, 'output.css'),
          ...(map === undefined ? {} : { map }),
        }
        const { handler, onDiagnostic } = createHandler(options)
        await writeFile(mapFile, JSON.stringify(previousMap('first')))
        const first = await handler(mappedCss)
        await writeFile(mapFile, JSON.stringify(previousMap('second')))
        const second = await handler(mappedCss)
        const expected = await createHandler(options).handler(mappedCss)
        expect(second.map?.toJSON()).toEqual(expected.map?.toJSON())
        expect(second.map?.toJSON().sources).not.toEqual(first.map?.toJSON().sources)
        expect(second.map?.toJSON().sourcesContent).toContain('$color: second;')
        expect(second.map?.toJSON().sourcesContent).not.toContain('$color: first;')
        expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
        expect(second.processor).toBe(first.processor)
      }
      finally {
        await rm(directory, { recursive: true, force: true })
      }
    })
  }

  it('规范化后的行注释同样逐次发现外部 map', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
    try {
      const mapFile = path.join(directory, 'input.css.map')
      const options = { from: path.join(directory, 'input.css'), map: { inline: false, annotation: false } }
      const source = `${css}\n// # sourceMappingURL=input.css.map`
      const { handler, onDiagnostic } = createHandler(options)
      await writeFile(mapFile, JSON.stringify(previousMap('first')))
      const first = await handler(source)
      await writeFile(mapFile, JSON.stringify(previousMap('second')))
      const second = await handler(source)
      expect(second.map?.toJSON()).toEqual((await createHandler(options).handler(source)).map?.toJSON())
      expect(second.map?.toJSON().sources).not.toEqual(first.map?.toJSON().sources)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  for (const transition of ['created', 'removed'] as const) {
    it(`map 文件 ${transition} 后不复用旧发现结果`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
      try {
        const mapFile = path.join(directory, 'input.css.map')
        const options = { from: path.join(directory, 'input.css'), map: { inline: false, annotation: false } }
        if (transition === 'removed') {
          await writeFile(mapFile, JSON.stringify(previousMap('first')))
        }
        const { handler, onDiagnostic } = createHandler(options)
        const first = await handler(mappedCss)
        if (transition === 'created') {
          await writeFile(mapFile, JSON.stringify(previousMap('second')))
        }
        else {
          await rm(mapFile)
        }
        const second = await handler(mappedCss)
        expect(second.map?.toJSON()).toEqual((await createHandler(options).handler(mappedCss)).map?.toJSON())
        expect(Boolean(second.root.source?.input.map)).toBe(transition === 'created')
        expect(Boolean(second.root.source?.input.map)).not.toBe(Boolean(first.root.source?.input.map))
        expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
      }
      finally {
        await rm(directory, { recursive: true, force: true })
      }
    })
  }

  for (const map of [false, { prev: false }, { prev: JSON.stringify(previousMap('explicit')), inline: false, annotation: false }] as const) {
    it(`显式 map/prev 策略不自动加载磁盘，仍命中结果缓存：${JSON.stringify(map)}`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
      try {
        const mapFile = path.join(directory, 'input.css.map')
        const options = { from: path.join(directory, 'input.css'), map }
        await writeFile(mapFile, JSON.stringify(previousMap('first')))
        const { handler, onDiagnostic } = createHandler(options)
        const first = await handler(mappedCss)
        await writeFile(mapFile, JSON.stringify(previousMap('second')))
        const second = await handler(mappedCss)
        expect(second.css).toBe(first.css)
        expect(second.map?.toJSON()).toEqual(first.map?.toJSON())
        expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
      }
      finally {
        await rm(directory, { recursive: true, force: true })
      }
    })
  }

  it('没有引用和固定 inline map 的文本仍命中缓存', async () => {
    const inline = Buffer.from(JSON.stringify(previousMap('inline'))).toString('base64')
    for (const source of [css, `${css}\n/*# sourceMappingURL=data:application/json;base64,${inline} */`]) {
      const { handler, onDiagnostic } = createHandler({ from: 'input.css', map: { inline: false, annotation: false } })
      const first = await handler(source)
      const second = await handler(source)
      expect(second.css).toBe(first.css)
      expect(second.map?.toJSON()).toEqual(first.map?.toJSON())
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    }
  })

  for (const externalLast of [false, true]) {
    it(`多个注释遵循最后文本标记，externalLast=${externalLast}`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
      try {
        const mapFile = path.join(directory, 'input.css.map')
        const inline = `/*# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(previousMap('inline'))).toString('base64')} */`
        const external = '/*# sourceMappingURL=input.css.map */'
        const source = [css, ...(externalLast ? [inline, external] : [external, inline])].join('\n')
        const options = { from: path.join(directory, 'input.css'), map: { inline: false, annotation: false } }
        const { handler, onDiagnostic } = createHandler(options)
        await writeFile(mapFile, JSON.stringify(previousMap('first')))
        await handler(source)
        await writeFile(mapFile, JSON.stringify(previousMap('second')))
        const result = await handler(source)
        expect(result.map?.toJSON()).toEqual((await createHandler(options).handler(source)).map?.toJSON())
        expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(!externalLast)
      }
      finally {
        await rm(directory, { recursive: true, force: true })
      }
    })
  }

  it('上游在 CSS 字符串内识别的文本标记也不能复用旧 map', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
    try {
      const mapFile = path.join(directory, 'input.css.map')
      const source = '.a{content:"/*# sourceMappingURL=input.css.map */"}'
      const options = { from: path.join(directory, 'input.css'), map: { inline: false, annotation: false } }
      const { handler, onDiagnostic } = createHandler(options)
      await writeFile(mapFile, JSON.stringify(previousMap('first')))
      const first = await handler(source)
      await writeFile(mapFile, JSON.stringify(previousMap('second')))
      const result = await handler(source)
      expect(result.map?.toJSON()).toEqual((await createHandler(options).handler(source)).map?.toJSON())
      expect(result.map?.toJSON().sources).not.toEqual(first.map?.toJSON().sources)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('unsafeMap 允许无 from 的外部引用时仍逐次加载', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
    try {
      const mapFile = path.join(directory, 'input.css.map')
      const source = `${css}\n/*# sourceMappingURL=${mapFile} */`
      const options = { unsafeMap: true, map: { inline: false, annotation: false } }
      const { handler, onDiagnostic } = createHandler(options)
      await writeFile(mapFile, JSON.stringify(previousMap('first')))
      const first = await handler(source)
      await writeFile(mapFile, JSON.stringify(previousMap('second')))
      const result = await handler(source)
      expect(result.map?.toJSON()).toEqual((await createHandler(options).handler(source)).map?.toJSON())
      expect(result.map?.toJSON().sources).not.toEqual(first.map?.toJSON().sources)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('重新解析的 Root 已带入本轮 map 字节，保留准确 Input 来源', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'postcss-auto-map-'))
    try {
      const mapFile = path.join(directory, 'input.css.map')
      const options = { from: path.join(directory, 'input.css'), map: { inline: false, annotation: false } }
      const { handler, onDiagnostic } = createHandler(options)
      await writeFile(mapFile, JSON.stringify(previousMap('first')))
      const first = await handler.transformRoot(postcss.parse(mappedCss, options))
      await writeFile(mapFile, JSON.stringify(previousMap('second')))
      const root = postcss.parse(mappedCss, options)
      const second = await handler.transformRoot(root)
      expect(second.map?.toJSON()).toEqual((await createHandler(options).handler.transformRoot(root)).map?.toJSON())
      expect(second.map?.toJSON().sources).not.toEqual(first.map?.toJSON().sources)
      expect(second.root.source?.input).toBe(root.source?.input)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
