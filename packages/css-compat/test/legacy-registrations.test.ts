import postcss from 'postcss'
import { consumeCascadeLayers } from '../src/legacy'

it.each(['property', 'PROPERTY', String.raw`pro\70 erty`, String.raw`p\72operty`])('legacy layer 不把 @%s 子树中的无效注册变成有效注册', (name) => {
  const registration = `@${name} --color-brand { @layer x { syntax: "<color>"; inherits: false; initial-value: #00f; } }`
  const root = postcss.parse(`${registration} @layer app { .probe { color: red; } }`)
  consumeCascadeLayers(root)
  expect(root.toString()).toContain(registration)
  expect(root.toString()).not.toContain('@layer app')
  expect(root.toString()).toContain('.probe { color: red; }')
  const first = root.toString()
  consumeCascadeLayers(root)
  expect(root.toString()).toBe(first)
})
