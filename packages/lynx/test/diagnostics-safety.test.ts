import { createLynxDiagnosticsReport, hasStrictLynxDiagnosticFailure } from '../src/diagnostics'

const rule = (selector: string) => ({
  type: 'StyleRule',
  selectorText: { value: selector, loc: { line: 1, column: 1 } },
  style: [{ name: 'mask-type', value: 'luminance', keyLoc: { line: 1, column: 20 } }],
})

describe('Lynx encoder 诊断不能猜测删除与来源', () => {
  it.each([
    { type: 'property', name: 'mask-type', module: 'missing.css', line: 1, column: 20 },
    { type: 'property', name: 'padding-inline', module: 'main', line: 1, column: 20 },
    { type: 'future-syntax', name: 'mask-type', module: 'main', line: 1, column: 20 },
    { type: 'property', name: 'mask-type', line: 1, column: 20 },
  ])('不能把未知或歧义诊断提升为 strict 错误：%j', (raw) => {
    const report = createLynxDiagnosticsReport(JSON.stringify([raw]), {
      cssMap: { main: [rule('.card')], other: [rule('.other')] },
    })
    expect(report.diagnostics[0]).toMatchObject({ status: 'unknown', category: 'unknown' })
    expect(hasStrictLynxDiagnosticFailure(report, { strict: true })).toBe(false)
  })

  it('没有编码后证据时不把 warning 等同于确证删除', () => {
    const report = createLynxDiagnosticsReport(JSON.stringify([
      { type: 'property', name: 'mask-type', module: 'main', line: 1, column: 20 },
    ]), { cssMap: { main: [rule('.card')] } })
    expect(report.diagnostics[0]?.status).toBe('unknown')
    expect(hasStrictLynxDiagnosticFailure(report, { strict: true })).toBe(false)
  })

  it('保留不能解析的原始诊断供审计', () => {
    const raw = 'future encoder format: important evidence'
    const report = createLynxDiagnosticsReport(raw, {})
    expect(JSON.stringify(report)).toContain(raw)
  })
})
