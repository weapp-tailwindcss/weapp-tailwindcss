import { it } from 'vitest'
import { createCssRuntimeAffectingSignature } from '../src/syntax/runtime-signature'

const source = Array.from({ length: 1000 }, (_, index) => `.card-${index} { color: red; padding: ${index}px; }`).join('\n')

it('signs 1000 CSS rules', async ({ bench }) => {
  await bench('CSS runtime signature', () => createCssRuntimeAffectingSignature(source)).run()
})
