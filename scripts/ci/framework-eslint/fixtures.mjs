// 同时覆盖允许项与应报错代码，防止规则被整体关闭后仍通过。
export const taroCases = [
  {
    filename: 'unused-policy.ts',
    source: `export function unusedPolicy(ignoredArgument: string) {
  try {
    throw new Error('expected')
  } catch (ignoredError) {
    Math.abs(-1)
  }
  const unusedLocal = 1
  const ReactCompat = 1
  const NervCompat = 1
  const { omitted, ...rest } = { omitted: 1, kept: 2 }
  return rest
}
`,
    rules: ['@typescript-eslint/no-unused-vars', '@typescript-eslint/no-shadow', 'no-unused-vars', 'no-shadow'],
    expected: [['@typescript-eslint/no-unused-vars', 1, 7]],
  },
  {
    filename: 'shadow-policy.ts',
    source: `type Token = string
export function typeAndValue(Token: Token) {
  return Token
}

const callbackName = 1
export type Callback = (callbackName: number) => number
export const keepCallbackName = callbackName

const actualValue = 1
export function actualShadow(actualValue: number) {
  return actualValue
}
export const keepActualValue = actualValue

export function beforeFunction(laterFunction: number) {
  return laterFunction
}
function laterFunction() {
  return 1
}
export const keepLaterFunction = laterFunction

export function beforeVariable(laterVariable: number) {
  return laterVariable
}
const laterVariable = 1
export const keepLaterVariable = laterVariable

export function beforeType() {
  type LaterType = number
  const value: LaterType = 1
  return value
}
type LaterType = string
export type KeepLaterType = LaterType
`,
    rules: ['@typescript-eslint/no-unused-vars', '@typescript-eslint/no-shadow', 'no-unused-vars', 'no-shadow'],
    expected: [['@typescript-eslint/no-shadow', 2, 11], ['@typescript-eslint/no-shadow', 2, 16]],
  },
  {
    filename: 'typescript-scope.tsx',
    source: `type DisposableResource = { [Symbol.dispose](): void }
declare function openResource(): DisposableResource

export function modernScope<const T extends { value: number }>(input: T) {
  using resource = openResource()
  const checked = { input, resource } satisfies { input: T, resource: DisposableResource }
  const unusedModernLocal = checked.input.value
  return <view>{checked.input.value}</view>
}
`,
    rules: ['@typescript-eslint/no-unused-vars', '@typescript-eslint/no-shadow', 'no-unused-vars', 'no-shadow'],
    expected: [['@typescript-eslint/no-unused-vars', 1, 7]],
  },
]

export const mpxCases = [
  {
    filename: 'unused-policy.ts',
    source: `export function recover(unusedArgument: string) {
  try {
    throw new Error('expected')
  } catch (ignoredError) {
    Math.abs(-1)
  }
  const unusedLocal = 1
  return 1
}
`,
    rules: ['@typescript-eslint/no-unused-vars', 'no-unused-vars'],
    expected: [['@typescript-eslint/no-unused-vars', 1, 1], ['@typescript-eslint/no-unused-vars', 1, 7]],
  },
  {
    filename: 'expressions-policy.ts',
    source: `declare const ready: boolean
declare function run(): void
declare function tag(parts: TemplateStringsArray): void
ready && run()
ready ? run() : run()
tag\`value\`
1 + 2
`,
    rules: ['no-unused-expressions', '@typescript-eslint/no-unused-expressions'],
    expected: [['no-unused-expressions', 2, 7]],
  },
  {
    filename: 'banned-types-policy.ts',
    source: `export type Wrapper = String
export type FunctionType = Function
export type NonNullish = {}
`,
    rules: ['@typescript-eslint/no-restricted-types', '@typescript-eslint/no-empty-object-type', '@typescript-eslint/no-unsafe-function-type', '@typescript-eslint/no-wrapper-object-types'],
    expected: [['@typescript-eslint/no-restricted-types', 2, 1], ['@typescript-eslint/no-restricted-types', 2, 2], ['@typescript-eslint/no-restricted-types', 2, 3]],
  },
  {
    filename: 'abstract-semicolons.ts',
    source: `export abstract class Example { abstract method(): void;; abstract value: string;; }
`,
    rules: ['no-extra-semi', '@stylistic/ts/no-extra-semi'],
    expected: [['@stylistic/ts/no-extra-semi', 2, 1], ['@stylistic/ts/no-extra-semi', 2, 1]],
  },
  {
    filename: 'typed-script.ts',
    source: `const value: number = 1
export default { value }
`,
    rules: ['@typescript-eslint/no-inferrable-types'],
    expected: [['@typescript-eslint/no-inferrable-types', 2, 1]],
  },
  {
    filename: 'typed-page.mpx',
    source: `<template><view>{{ value }}</view></template>
<script lang="ts">
const value: number = 1
export default { value }
</script>
`,
    rules: ['@typescript-eslint/no-inferrable-types'],
    expected: [],
  },
]
