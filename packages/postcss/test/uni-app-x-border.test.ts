import {
  createUniAppXBorderPreflight,
  hoistUniAppXBorderPreflight,
  postcss,
  UNI_APP_X_BORDER_PREFLIGHT_CLASS,
} from '@/index'

const reset = `.${UNI_APP_X_BORDER_PREFLIGHT_CLASS} { border-width: 0; }`

describe('uni-app x border preflight css', () => {
  it('restores base priority after component CSS replay without crossing imports', () => {
    const source = `@import "./theme.wxss";@media (min-width:1px){.custom{border-width:3px}}.native{border-top-width:1px}.apply{border-top-width:1px}${reset}.pair{border-left-width:2px}`
    const output = hoistUniAppXBorderPreflight(source)
    const root = postcss.parse(output)
    expect(root.nodes.map(node => node.type === 'rule' ? node.selector : node.type === 'atrule' ? node.name : node.type)).toEqual(['import', `.${UNI_APP_X_BORDER_PREFLIGHT_CLASS}`, 'media', '.native', '.apply', '.pair'])
    expect(hoistUniAppXBorderPreflight(output)).toBe(output)
    expect(hoistUniAppXBorderPreflight('.custom{border-width:3px}')).toBe('.custom{border-width:3px}')
  })

  it('uses only configured border defaults and honors disabling', () => {
    expect(createUniAppXBorderPreflight(false)).toBeUndefined()
    expect(createUniAppXBorderPreflight()).toBeUndefined()
    expect(createUniAppXBorderPreflight({ border: false, 'border-width': false, padding: '0' })).toBeUndefined()
    const parsed = postcss.parse(createUniAppXBorderPreflight({ border: false, 'border-width': '0', padding: '0' })!)
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.first).toMatchObject({ selector: `.${UNI_APP_X_BORDER_PREFLIGHT_CLASS}`, nodes: [{ prop: 'border-width', value: '0' }] })
    expect(createUniAppXBorderPreflight({ border: '0 solid', 'border-color': 'red' })).toContain('border: 0 solid;')
  })
})
