import { createLynxDiagnosticsReport, hasStrictLynxDiagnosticFailure } from '../src/diagnostics'

const rule = (selector: string, properties = ['mask-type']) => ({
  type: 'StyleRule',
  selectorText: { value: selector, loc: { line: 1, column: 1 } },
  style: properties.map((name, index) => ({ name, value: name === 'mask-type' ? 'luminance' : '1px', keyLoc: { line: 1, column: 20 + index } })),
})
function report(cssText: string, input = { cssMap: { main: [rule('.card')] } }, options = {}) {
  return createLynxDiagnosticsReport(JSON.stringify([{ type: 'property', name: 'mask-type', module: 'main', line: 1, column: 20 }]), input, options, {}, {
    cssText, bundleSha256: '1'.repeat(64), decoderIdentity: 'unit-test-decoder',
  })
}

describe('输入、编码产物和 warning 分别提供证据', () => {
  it.each([
    { error: '固定 decoder 失败' },
    { cssText: '.card {', bundleSha256: '1'.repeat(64), decoderIdentity: 'unit-test-decoder' },
  ])('没有 warning 时缺少可信解码证据仍明确报告 unknown', (evidence) => {
    const result = createLynxDiagnosticsReport(undefined, { cssMap: { main: [rule('.card')] } }, {}, {}, evidence)
    expect(result.counts.unknown).toBeGreaterThan(0)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ origin: 'bundle-comparison', status: 'unknown', reason: expect.any(String) }))
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(false)
  })

  it('encoder 没发 property warning 时仍从真实产物比较发现部分删除', () => {
    const result = createLynxDiagnosticsReport(undefined, { cssMap: { main: [rule('.card', ['mask-type', 'width'])] } }, {}, {}, {
      cssText: '.card { width: 1px; }', bundleSha256: '1'.repeat(64), decoderIdentity: 'unit-test-decoder',
    })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      origin: 'bundle-comparison', property: 'mask-type', status: 'encoder-rejected', category: 'business',
    }))
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(true)
  })

  it('selector warning 仍保留时不能掩盖同一规则的静默属性删除', () => {
    const result = createLynxDiagnosticsReport([{ type: 'selector', name: '.card', line: 1, column: 1 }], { cssMap: { main: [rule('.card', ['mask-type', 'width'])] } }, {}, {}, {
      cssText: '.card { width: 1px; }', bundleSha256: '1'.repeat(64), decoderIdentity: 'unit-test-decoder',
    })
    expect(result.diagnostics[0]?.status).toBe('bundled')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ origin: 'bundle-comparison', property: 'mask-type', status: 'encoder-rejected' }))
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(true)
  })
  it('warning 对应属性仍保留时不触发 strict', () => {
    const result = report('.card { mask-type: luminance; }')
    expect(result.diagnostics[0]?.status).toBe('bundled')
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(false)
  })

  it('混合 --tw-* 业务规则的部分属性丢失仍触发 strict', () => {
    const input = { cssMap: { main: [rule('.card', ['mask-type', '--tw-local', 'width'])] } }
    const result = report('.card { --tw-local: 1px; width: 1px; }', input)
    expect(result.diagnostics[0]).toMatchObject({ status: 'encoder-rejected', category: 'business' })
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(true)
  })

  it('selector list 的每个分支均需要保留声明', () => {
    const result = report('.card { mask-type: luminance; } .other { width: 1px; }', { cssMap: { main: [rule('.card, .other')] } })
    expect(result.diagnostics[0]?.status).toBe('encoder-rejected')
  })

  it('不能用跨 cssId 的同名规则推断归属', () => {
    const input = { cssMap: { main: [rule('.card')], other: [rule('.card')] } }
    expect(report('.card { mask-type: luminance; }', input).diagnostics[0]?.status).toBe('unknown')
  })

  it('转义等价的跨 cssId 分支及重叠 selector list 也存在歧义', () => {
    for (const selector of ['.c\\61rd', '.other, .card']) {
      const input = { cssMap: { main: [rule('.card')], other: [rule(selector)] } }
      expect(report('.card { mask-type: luminance; }', input).diagnostics[0]?.status).toBe('unknown')
    }
  })

  it('important 优先级丢失及输出重复声明不能认定完整保留', () => {
    const important = rule('.card')
    Object.assign(important.style[0]!, { important: true })
    expect(report('.card { mask-type: luminance; }', { cssMap: { main: [important] } }).diagnostics[0]?.status).toBe('unknown')
    expect(report('.card { mask-type: luminance; mask-type: other; }').diagnostics[0]?.status).toBe('unknown')
  })

  it('ignore 理由属于审计说明而不是日志子串过滤器', () => {
    const result = report('.control { width: 1px; }', undefined, { ignore: [{ property: 'mask-type', reason: '业务接受本次平台限制' }] })
    expect(result.diagnostics[0]?.ignored?.reason).toBe('业务接受本次平台限制')
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(false)
    expect(report('.control { width: 1px; }', undefined, { ignore: [{ reason: '不能无范围忽略' }] }).diagnostics[0]?.ignored).toBeUndefined()
  })

  it('重复属性和未知规范化不伪装成删除', () => {
    expect(report('.card { mask-type: luminance; }', { cssMap: { main: [rule('.card', ['mask-type', 'mask-type'])] } }).diagnostics[0]?.status).toBe('unknown')
    expect(report('.card { mask-type: future-normalization; }').diagnostics[0]?.status).toBe('unknown')
  })

  it.each([
    ['padding', 'padding-top: 13px; padding-right: 13px; padding-bottom: 13px; padding-left: 13px;'],
    ['gap', 'row-gap: 13px; column-gap: 13px;'],
    ['columns', 'column-width: 13px; column-count: 2;'],
    ['grid-gap', 'row-gap: 13px; column-gap: 13px;'],
    ['word-wrap', 'overflow-wrap: anywhere;'],
    ['border-radius', 'border-top-left-radius: 13px;'],
  ])('正常 %s 编码展开没有独立等价 oracle 时保持 unknown', (name, css) => {
    const input = rule('.card', [name])
    const result = createLynxDiagnosticsReport([{ type: 'property', name, line: 1, column: 20 }], { cssMap: { main: [input] } }, {}, {}, {
      cssText: `.card { ${css} }`, bundleSha256: '1'.repeat(64), decoderIdentity: 'unit-test-decoder',
    })
    expect(result.diagnostics[0]?.status).toBe('unknown')
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(false)
  })

  it('ignore 保留删除计数、原始日志和中文理由', () => {
    const result = report('.control { width: 1px; }', undefined, { ignore: [{ property: 'mask-type' }] })
    expect(result.counts.encoderRejected).toBe(1)
    expect(result.diagnostics[0]?.raw).toMatchObject({ name: 'mask-type' })
    expect(result.diagnostics[0]?.ignored?.reason).toBeTruthy()
    expect(hasStrictLynxDiagnosticFailure(result, { strict: true })).toBe(false)
  })
})
