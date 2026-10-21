import { digest } from '../identity'

export const autofillProbe = { id: 'autofill-native-outline', candidate: 'autofill:[outline:3px_solid_#123456]', features: ['variant/static/autofill'], engines: ['chromium'] } as const
export const autofillStates = ['initial', 'filled', 'restored'] as const
export const addressFields = [
  { id: 'probe', autocomplete: 'given-name', type: 'NAME_FIRST', value: 'Synthetic' },
  { id: 'reference', autocomplete: 'family-name', type: 'NAME_LAST', value: 'Regression' },
  { id: 'email', autocomplete: 'email', type: 'EMAIL_ADDRESS', value: 'tailwind@example.test' },
  { id: 'street', autocomplete: 'street-address', type: 'ADDRESS_HOME_LINE1', value: '123 Test Street' },
  { id: 'city', autocomplete: 'address-level2', type: 'ADDRESS_HOME_CITY', value: 'Test City' },
  { id: 'zip', autocomplete: 'postal-code', type: 'ADDRESS_HOME_ZIP', value: '94043' },
  { id: 'country', autocomplete: 'country', type: 'ADDRESS_HOME_COUNTRY', value: 'US' },
] as const
export const autofillIds = [...addressFields.map(field => field.id), 'control'] as const
export const outlineIds = ['probe', 'reference', 'email', 'control'] as const
export const autofillAddress = { fields: addressFields.map(field => ({ name: field.type, value: field.value })) }
export const autofillCss = '@import "tailwindcss" source(none);\n@layer base { body { margin:24px; background:white; } input { display:block; box-sizing:border-box; width:160px; height:40px; margin:0 0 16px; padding:0; border:1px solid #999; outline:0 none; outline-offset:0; color:#040506; caret-color:transparent; transition:none; } }'
export const autofillReference = '#reference:autofill { outline:3px solid #123456; }'

export function autofillUrl(runId: string) {
  return `http://tailwind-autofill.test/${encodeURIComponent(runId)}/${autofillProbe.id}`
}

export function autofillColors(runId: string, state: string, cssHash: string) {
  const hash = digest({ fixture: autofillProbe.id, runId, state, cssHash })
  return Array.from({ length: 8 }, (_, index) => [0, 1, 2].map(channel => Number.parseInt(hash.slice(index * 6 + channel * 2, index * 6 + channel * 2 + 2), 16)))
}

export function autofillScreenshot(state: string) {
  return `${autofillProbe.id}-${state}.png`
}

/** 只记录真实事件；页面脚本不写入字段值或伪造伪类。 */
export function renderAutofill(css: string, runId: string) {
  const escaped = runId.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const fields = addressFields.map(field => `<input id="${field.id}" name="${field.id}" autocomplete="${field.autocomplete}"${field.id === 'probe' ? ` class="${autofillProbe.candidate}"` : ''}>`).join('')
  return `<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style><style>${autofillReference}</style></head><body data-fixture="${autofillProbe.id}" data-run-id="${escaped}"><form>${fields}</form><form><input id="control" name="control" autocomplete="off" class="${autofillProbe.candidate}"></form><div id="identity" style="position:absolute;left:24px;top:480px;display:flex;width:32px;height:4px">${'<i style="display:block;width:4px;height:4px"></i>'.repeat(8)}</div><script>globalThis.__autofillJournal=[];for(const type of ['input','beforeinput','keydown'])document.addEventListener(type,event=>{if(event.target instanceof HTMLInputElement)globalThis.__autofillJournal.push({type,id:event.target.id,value:event.target.value,trusted:event.isTrusted,inputType:event.inputType||'',key:event.key||''})});</script></body></html>`
}
