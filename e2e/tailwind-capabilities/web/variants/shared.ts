import type { WebControl } from '../controls'
import type { WebProbe } from '../probes'

export const neutralBackground = 'rgb(1, 2, 3)'
export const activeBackground = 'rgb(18, 52, 86)'
export const variantElement = '<div id="probe" class="probe CANDIDATE">variant probe</div>'
export const variantInput = '<input id="probe" class="probe CANDIDATE" style="appearance:none;width:80px;height:40px">'

export function variantProbe(id: string, variant: string, features: string[], controls: WebControl[], html = variantElement, options: Partial<WebProbe> = {}): WebProbe {
  return { id, candidate: `${variant}:bg-[#123456]`, html, features, controls, action: 'dynamic', component: 'view', property: 'background-color', before: neutralBackground, expected: activeBackground, ...options }
}

export function attribute(selector: string, name: string, before: string | null, after: string | null): WebControl {
  return { kind: 'attribute', selector, name, before, after }
}
