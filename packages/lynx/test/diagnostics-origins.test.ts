import { captureCssSnapshot, mapCssOrigin, snapshotMatches } from '../src/diagnostics/origins'

function fixture(file = 'source.css') {
  const first = '.a { width: 1px; }'
  const second = '.b { height: 2px; }'
  const chunks = [
    { name: 'a.css', source: { source: () => first, map: () => null } },
    { name: 'b.css', source: { source: () => `\n${second}`, map: () => ({ version: 3, names: [], sources: [file], mappings: ';AAKE' }) } },
  ]
  const css = { cssMap: { 0: [] }, cssSource: { 0: '/cssId/0.css' }, contentMap: new Map([[0, [first, second]]]), chunks }
  return { css, chunks, first, second }
}

describe('构建图 CSS 来源证据', () => {
  it.each(['source.css', '../src/theme.css', '/project/src/theme.css', 'C:\\project\\src\\theme.css', '\\\\server\\share\\theme.css', 'file:///C:/project/theme.css'])('撤销多个 asset 拼接偏移后保留 source map 的路径身份：%s', (file) => {
    const { css } = fixture(file)
    expect(mapCssOrigin(captureCssSnapshot(css), '0', 2, 1)).toMatchObject({ file, line: 6, column: 3, asset: 'b.css' })
  })

  it('缺 map、段内容重复或跨 asset 歧义时不猜原文件', () => {
    const { css, chunks, first, second } = fixture()
    expect(mapCssOrigin(captureCssSnapshot(css), '0', 1, 1)).toBeUndefined()
    css.chunks.push({ name: 'duplicate.css', source: chunks[1]!.source })
    expect(mapCssOrigin(captureCssSnapshot(css), '0', 2, 1)).toBeUndefined()
    css.chunks = [{ name: 'repeat.css', source: { source: () => `${second}\n${second}`, map: chunks[1]!.source.map } }]
    expect(mapCssOrigin(captureCssSnapshot(css), '0', 2, 1)).toBeUndefined()
    expect(mapCssOrigin(captureCssSnapshot(css), '0', 99, first.length)).toBeUndefined()
  })

  it('最终输入或 chunk 身份漂移会拒绝来源快照', () => {
    const { css, chunks } = fixture()
    const snapshot = captureCssSnapshot(css)!
    expect(snapshotMatches(snapshot, css, chunks)).toBe(true)
    expect(snapshotMatches(snapshot, { ...css, cssMap: { 1: [] } }, chunks)).toBe(false)
    expect(snapshotMatches(snapshot, css, [...chunks].reverse())).toBe(false)
    expect(snapshotMatches(snapshot, css, [{ ...chunks[0], name: 'renamed.css' }, chunks[1]])).toBe(false)
  })

  it('source map 替换或原地修改都不能改变已保存来源', () => {
    const { css, chunks } = fixture()
    const map = chunks[1]!.source.map()!
    chunks[1]!.source.map = () => map
    const snapshot = captureCssSnapshot(css)!
    map.sources[0] = 'wrong.css'
    expect(snapshotMatches(snapshot, css, chunks)).toBe(false)
    expect(mapCssOrigin(snapshot, '0', 2, 1)?.file).toBe('source.css')
  })

  it('消费构建图 related.sourceMap 资源而不猜磁盘或 URL 路径', () => {
    const text = '.b { height: 2px; }'
    const map = { version: 3, names: [], sources: ['original.css'], mappings: 'AAKE' }
    const source = JSON.stringify(map)
    const chunk = { name: 'generated.css', info: { related: { sourceMap: 'declared-resource.map' } }, source: { source: () => text, map: () => null } }
    const css = { cssMap: { 0: [] }, contentMap: new Map([[0, [text]]]), chunks: [chunk] }
    const getAsset = (name: string) => name === 'declared-resource.map' ? { source: { source: () => source } } : undefined
    const snapshot = captureCssSnapshot(css, getAsset)!
    expect(mapCssOrigin(snapshot, '0', 1, 1)).toMatchObject({ file: 'original.css', line: 6, column: 3 })
    expect(snapshotMatches(snapshot, css, [chunk], getAsset)).toBe(true)
    expect(snapshotMatches(snapshot, css, [chunk], () => undefined)).toBe(false)
  })
})
