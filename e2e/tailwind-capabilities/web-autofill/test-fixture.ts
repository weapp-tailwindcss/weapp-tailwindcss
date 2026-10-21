import type { Buffer } from 'node:buffer'
import type { AutofillJournalEntry, AutofillObservation } from './types'
import { PNG } from 'pngjs'
import { digest } from '../identity'
import { addressFields, autofillAddress, autofillColors, autofillIds, autofillProbe, autofillScreenshot, autofillStates, autofillUrl } from './fixtures'

/** 仅用于证据拒绝回归；合成 PNG 和事件不能作为实际浏览器验收。 */
export function syntheticAutofill(runId = 'unit-autofill', cssHash = digest('unit-css')) {
  const screenshots = new Map<string, Buffer>()
  const identity = { frameId: 'unit-frame', backendIds: Object.fromEntries(autofillIds.map((id, index) => [id, index + 10])) }
  const observation: AutofillObservation = { timeline: ['enable', 'state/initial', 'trigger', 'native-event/0', 'state/filled', 'state/restored', 'disable'], identity, commands: [{ method: 'Autofill.enable', params: {}, response: {} }, { method: 'Autofill.trigger', params: { fieldId: identity.backendIds['probe'], frameId: identity.frameId, address: autofillAddress }, response: {} }], events: [{ filledFields: addressFields.map(field => ({ id: field.id, name: field.id, value: field.value, htmlType: 'text', autofillType: field.type, fillingStrategy: 'autocompleteAttribute', frameId: identity.frameId, fieldId: identity.backendIds[field.id]! })), addressUi: {} }], states: [], cleanup: { detached: true, errors: [], disable: { method: 'Autofill.disable', params: {}, response: {} } } }
  const filled: AutofillJournalEntry[] = addressFields.map(({ id, value }) => ({ id, value, type: 'input', trusted: true, inputType: '', key: '' }))
  const restored: AutofillJournalEntry[] = addressFields.flatMap(({ id }) => [
    { id, value: 'old', type: 'keydown', trusted: true, inputType: '', key: 'Backspace' },
    { id, value: 'old', type: 'beforeinput', trusted: true, inputType: 'deleteContentBackward', key: '' },
    { id, value: '', type: 'input', trusted: true, inputType: 'deleteContentBackward', key: '' },
    { id, value: '', type: 'beforeinput', trusted: true, inputType: 'insertText', key: '' },
    { id, value: 'Edited', type: 'input', trusted: true, inputType: 'insertText', key: '' },
  ])
  autofillStates.forEach((name, index) => {
    const png = new PNG({ width: 640, height: 540 })
    png.data.fill(255)
    const fields = Object.fromEntries(autofillIds.map((id, i) => {
      const active = name === 'filled' && id !== 'control'
      const outline = active && (id === 'probe' || id === 'reference')
      const rect = { left: 24, top: 24 + i * 56, width: 160, height: 40 }
      if (outline) {
        for (let y = rect.top - 3; y < rect.top + rect.height + 3; y++) {
          for (let x = rect.left - 3; x < rect.left + rect.width + 3; x++) {
            if (x < rect.left || x >= rect.left + rect.width || y < rect.top || y >= rect.top + rect.height) {
              png.data.set([18, 52, 86, 255], (y * png.width + x) * 4)
            }
          }
        }
      }
      return [id, { value: name === 'initial' || id === 'control' ? '' : name === 'restored' ? 'Edited' : addressFields.find(field => field.id === id)!.value, autofill: active, outline: { width: outline ? '3px' : '0px', style: outline ? 'solid' : 'none', color: outline ? 'rgb(18, 52, 86)' : 'rgb(4, 5, 6)' }, rect }]
    }))
    autofillColors(runId, name, cssHash).forEach((color, i) => png.data.set([...color, 255], (482 * 640 + 24 + i * 4 + 2) * 4))
    const screenshot = autofillScreenshot(name)
    screenshots.set(screenshot, PNG.sync.write(png))
    observation.states.push({ name, id: autofillProbe.id, runId, url: autofillUrl(runId), frames: [index * 3 + 1, index * 3 + 2], fields, journal: structuredClone(index === 0 ? [] : index === 1 ? filled : [...filled, ...restored]), screenshot })
  })
  return { runId, cssHash, observation, screenshots }
}
