import { createLynxDiagnosticsReport, hasStrictLynxDiagnosticFailure } from '../src/diagnostics'

function cssMap() {
  return {
    cssMap: {
      main: [{
        type: 'StyleRule',
        selectorText: { value: '.px-\\[7.5px\\]', loc: { line: 1, column: 1 } },
        style: [{ name: 'padding-inline', value: '7.5px', keyLoc: { line: 1, column: 20 } }],
      }, {
        type: 'StyleRule',
        selectorText: { value: ':root, :where(*)', loc: { line: 2, column: 1 } },
        style: [{ name: '--tw-color', value: 'red', keyLoc: { line: 2, column: 20 } }],
      }],
    },
  }
}

describe('Lynx CSS diagnostics', () => {
  it('关联 encoder 删除的业务声明并在 strict 模式下失败', () => {
    const report = createLynxDiagnosticsReport(
      JSON.stringify([{ type: 'property', name: 'padding-inline', line: 1, column: 20 }]),
      cssMap(),
      {},
      { targetSdkVersion: '3.9', engineVersion: '4.0.1' },
    )

    expect(report).toMatchObject({
      counts: { generated: 2, encoderRejected: 1, unknown: 0 },
      versions: { engine: '4.0.1', targetSdk: '3.9' },
    })
    expect(report.diagnostics[0]).toMatchObject({
      status: 'encoder-rejected',
      category: 'business',
      property: 'padding-inline',
      selector: '.px-\\[7.5px\\]',
    })
    expect(hasStrictLynxDiagnosticFailure(report, { strict: true })).toBe(true)
  })

  it('把 preflight/default 规则和未知 encoder 格式保留为非业务诊断', () => {
    const preflight = createLynxDiagnosticsReport(
      JSON.stringify([{ type: 'property', name: '--tw-color', line: 2, column: 20 }]),
      cssMap(),
      { strict: true },
    )
    expect(preflight.diagnostics[0]?.category).toBe('preflight')
    expect(hasStrictLynxDiagnosticFailure(preflight, { strict: true })).toBe(false)

    const unknown = createLynxDiagnosticsReport('future-format', cssMap(), { strict: true })
    expect(unknown.diagnostics[0]).toMatchObject({ status: 'unknown', category: 'unknown' })
    expect(hasStrictLynxDiagnosticFailure(unknown, { strict: true })).toBe(false)
  })

  it('支持按 selector/property 忽略已知业务诊断', () => {
    const report = createLynxDiagnosticsReport(
      JSON.stringify([{ type: 'property', name: 'padding-inline', line: 1, column: 20 }]),
      cssMap(),
      { ignore: [{ selector: '.px-\\[7.5px\\]', property: 'padding-inline' }] },
    )
    expect(report.diagnostics).toEqual([])
    expect(report.counts.encoderRejected).toBe(0)
  })

  it('按入口模块关联来源并聚合重复 encoder 事件', () => {
    const report = createLynxDiagnosticsReport(
      JSON.stringify([
        { type: 'property', name: 'padding-inline', module: 'components.css', line: 1, column: 20 },
        { type: 'property', name: 'padding-inline', module: 'components.css', line: 1, column: 20 },
        { type: 'property', name: 'padding-inline', module: 'other.css', line: 1, column: 20 },
      ]),
      {
        cssMap: {
          'components.css': [{
            type: 'StyleRule',
            selectorText: { value: '.card', loc: { line: 1, column: 1 } },
            style: [{ name: 'padding-inline', value: '7.5px', keyLoc: { line: 1, column: 20 } }],
          }],
          'other.css': [{
            type: 'StyleRule',
            selectorText: { value: '.other', loc: { line: 1, column: 1 } },
            style: [{ name: 'padding-inline', value: '8px', keyLoc: { line: 1, column: 20 } }],
          }],
        },
      },
      {},
      { encoderVersion: '0.16.3', engineVersion: '4.0.1' },
    )

    expect(report.counts).toEqual({ generated: 2, encoderRejected: 2, unknown: 0 })
    expect(report.versions).toEqual({ encoder: '0.16.3', engine: '4.0.1' })
    expect(report.diagnostics.map(item => item.source?.module)).toEqual(['components.css', 'other.css'])
    expect(report.diagnostics[0]).toMatchObject({ selector: '.card', value: '7.5px' })
  })
})
