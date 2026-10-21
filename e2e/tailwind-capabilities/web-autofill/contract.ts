import type { Buffer } from 'node:buffer'
import type { CaseContract, SemanticAssertion } from '../types'
import type { AutofillCommand, AutofillObservation } from './types'
import { digest } from '../identity'
import { readPixels } from '../web/pixels'
import { addressFields, autofillAddress, autofillColors, autofillCss, autofillIds, autofillProbe, autofillReference, autofillScreenshot, autofillStates, autofillUrl, outlineIds } from './fixtures'

export function autofillContract(runId: string): CaseContract {
  const expected: CaseContract['expectedValues'] = { 'generated': true, 'states/order': true, 'protocol/order': true, 'protocol/identity': true, 'protocol/enable': true, 'protocol/trigger': true, 'protocol/native-event': true, 'cleanup/disable': true, 'cleanup/detached': true, 'cleanup/no-errors': true }
  for (const name of autofillStates) {
    Object.assign(expected, { [`${name}/fixture/id`]: autofillProbe.id, [`${name}/fixture/run-id`]: runId, [`${name}/fixture/url`]: autofillUrl(runId), [`${name}/frames`]: true, [`${name}/pixel/identity`]: true, [`${name}/journal`]: true })
    for (const [index, id] of autofillIds.entries()) {
      const active = name === 'filled' && id !== 'control'
      const value = name === 'initial' || id === 'control' ? '' : name === 'restored' ? 'Edited' : addressFields.find(field => field.id === id)!.value
      Object.assign(expected, { [`${name}/${id}/value`]: value, [`${name}/${id}/autofill`]: active, [`${name}/${id}/geometry`]: JSON.stringify({ left: 24, top: 24 + index * 56, width: 160, height: 40 }) })
      if ((outlineIds as readonly string[]).includes(id)) {
        const outline = active && id !== 'email'
        expected[`${name}/${id}/outline/width`] = outline ? '3px' : '0px'
        expected[`${name}/${id}/outline/style`] = outline ? 'solid' : 'none'
        if (outline) {
          expected[`${name}/${id}/outline/color`] = 'rgb(18, 52, 86)'
        }
        expected[`${name}/${id}/pixel/outline`] = true
      }
    }
  }
  const names = Object.keys(expected)
  return { id: `runtime/${autofillProbe.id}`, candidate: autofillProbe.candidate, features: [...autofillProbe.features], fixture: JSON.stringify({ autofillProbe, autofillCss, autofillReference, addressFields, autofillStates }), expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: names, expectedValues: expected, assertionStages: { generated: 'generation', ...Object.fromEntries(names.filter(name => name.includes('/pixel/')).map(name => [name, 'visual' as const])) } }
}

function commandMatches(command: AutofillCommand | undefined, method: AutofillCommand['method'], params: AutofillCommand['params']) {
  return Boolean(command && command.method === method && !command.error && digest(command.params) === digest(params) && command.response && typeof command.response === 'object' && !Array.isArray(command.response) && Object.keys(command.response).length === 0)
}

/** 三条 outline 及外侧背景分别检查四边，不能仅以一个颜色点代替宽度。 */
export function outlinePixels(bytes: Buffer, rect: { left: number, top: number, width: number, height: number }, active: boolean) {
  for (let distance = 1; distance <= 4; distance++) {
    const color = active && distance <= 3 ? [18, 52, 86, 255] : [255, 255, 255, 255]
    const { left, top, width, height } = rect
    const locations = [[left + width / 2, top - distance], [left + width / 2, top + height + distance - 1], [left - distance, top + height / 2], [left + width + distance - 1, top + height / 2]]
    for (const [x, y] of locations) {
      const pixel = readPixels(bytes, { left: x!, top: y!, width: 1, height: 1 }, [{ id: 'outline', x: 0.5, y: 0.5, expected: [0, 0, 0, 0], tolerance: 0 }])[0]!
      if (digest(pixel.rgba) !== digest(color)) {
        return false
      }
    }
  }
  return true
}

export function autofillAssertions(contract: CaseContract, raw: AutofillObservation, generated: boolean, screenshots: ReadonlyMap<string, Buffer>, cssHash: string): SemanticAssertion[] {
  const identity = raw.identity
  const validIdentity = Boolean(identity?.frameId && autofillIds.every(id => Number.isSafeInteger(identity.backendIds[id]) && identity.backendIds[id]! > 0) && new Set(Object.values(identity.backendIds)).size === autofillIds.length)
  const fields = raw.events.length === 1 ? raw.events[0]!.filledFields : []
  const nativeEvent = validIdentity && fields.length === addressFields.length && addressFields.every((field) => {
    const matches = fields.filter(item => item.id === field.id)
    return matches.length === 1 && matches[0]!.fieldId === identity!.backendIds[field.id] && matches[0]!.frameId === identity!.frameId && matches[0]!.value === field.value && matches[0]!.name === field.id && matches[0]!.htmlType === 'text' && matches[0]!.fillingStrategy === 'autocompleteAttribute' && typeof matches[0]!.autofillType === 'string' && matches[0]!.autofillType.length > 0
  })
  const values: Record<string, SemanticAssertion['actual'] | undefined> = {
    generated,
    'states/order': digest(raw.states.map(state => state.name)) === digest(autofillStates),
    'protocol/identity': validIdentity,
    'protocol/order': digest(raw.timeline) === digest(['enable', 'state/initial', 'trigger', 'native-event/0', 'state/filled', 'state/restored', 'disable']),
    'protocol/enable': raw.commands.length === 2 && commandMatches(raw.commands[0], 'Autofill.enable', {}),
    'protocol/trigger': commandMatches(raw.commands[1], 'Autofill.trigger', { fieldId: identity?.backendIds['probe'], frameId: identity?.frameId, address: autofillAddress }),
    'protocol/native-event': nativeEvent,
    'cleanup/disable': commandMatches(raw.cleanup.disable, 'Autofill.disable', {}),
    'cleanup/detached': raw.cleanup.detached,
    'cleanup/no-errors': raw.cleanup.errors.length === 0,
  }
  for (const [index, name] of autofillStates.entries()) {
    const matches = raw.states.filter(state => state.name === name)
    if (matches.length !== 1) {
      continue
    }
    const state = matches[0]!
    const previous = raw.states[index - 1]
    Object.assign(values, { [`${name}/fixture/id`]: state.id, [`${name}/fixture/run-id`]: state.runId, [`${name}/fixture/url`]: state.url, [`${name}/frames`]: state.frames.length === 2 && state.frames.every(Number.isFinite) && state.frames[1]! > state.frames[0]! && (!previous || state.frames[0]! > previous.frames[1]!) })
    const journal = state.journal
    const prefix = !previous || digest(journal.slice(0, previous.journal.length)) === digest(previous.journal)
    const edits = previous ? journal.slice(previous.journal.length) : journal
    values[`${name}/journal`] = prefix && journal.every(event => event.trusted === true) && (name === 'initial'
      ? journal.length === 0
      : addressFields.every(({ id, value }) => {
          if (name === 'filled') {
            return edits.some(event => event.type === 'input' && event.id === id && event.value === value)
          }
          const own = edits.filter(event => event.id === id)
          const key = own.findIndex(event => event.type === 'keydown' && event.key === 'Backspace')
          const beforeDelete = own.findIndex((event, i) => i > key && event.type === 'beforeinput' && event.inputType === 'deleteContentBackward')
          const deletion = own.findIndex((event, i) => i > beforeDelete && event.type === 'input' && event.inputType === 'deleteContentBackward' && event.value === '')
          const insertion = own.findIndex((event, i) => i > deletion && event.type === 'beforeinput' && event.inputType === 'insertText')
          return key >= 0 && beforeDelete > key && deletion > beforeDelete && insertion > deletion && insertion < own.length - 1 && own.at(-1)?.type === 'input' && own.at(-1)?.inputType === 'insertText' && own.at(-1)?.value === 'Edited'
        }))
    const bytes = state.screenshot === autofillScreenshot(name) ? screenshots.get(state.screenshot) : undefined
    if (bytes) {
      const colors = autofillColors(String(contract.expectedValues[`${name}/fixture/run-id`]), name, cssHash)
      const pixels = readPixels(bytes, { left: 24, top: 480, width: 32, height: 4 }, colors.map((_, i) => ({ id: `identity-${i}`, x: (i + 0.5) / 8, y: 0.5, expected: [0, 0, 0, 0] as [number, number, number, number], tolerance: 0 })))
      values[`${name}/pixel/identity`] = pixels.every((pixel, i) => digest(pixel.rgba) === digest([...colors[i]!, 255]))
    }
    for (const [fieldIndex, id] of autofillIds.entries()) {
      const field = state.fields[id]
      values[`${name}/${id}/value`] = field?.value
      values[`${name}/${id}/autofill`] = field?.autofill
      const rect = { left: 24, top: 24 + fieldIndex * 56, width: 160, height: 40 }
      values[`${name}/${id}/geometry`] = field ? JSON.stringify(field.rect) : undefined
      for (const property of ['width', 'style', 'color'] as const) {
        values[`${name}/${id}/outline/${property}`] = field?.outline[property]
      }
      if (bytes && (outlineIds as readonly string[]).includes(id)) {
        values[`${name}/${id}/pixel/outline`] = outlinePixels(bytes, rect, name === 'filled' && id !== 'control' && id !== 'email')
      }
    }
  }
  return contract.requiredAssertions.map(name => ({ name, stage: contract.assertionStages?.[name] ?? 'runtime', actual: values[name] ?? null, expected: contract.expectedValues[name]! }))
}
