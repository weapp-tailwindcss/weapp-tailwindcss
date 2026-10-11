import { it } from 'vitest'
import { hasCssLocationDependencies } from '../src/syntax/location-dependencies'

const ordinaryCss = Array.from({ length: 1000 }, (_, index) => `.card-${index}{color:red;padding:${index}px}`).join('\n')

it('checks location dependencies in 1000 CSS rules', async ({ bench }) => {
  await bench('ordinary CSS without resource syntax', () => hasCssLocationDependencies(ordinaryCss)).run()
  await bench('relative resource before ordinary CSS', () => hasCssLocationDependencies(`.icon{background:url(./icon.svg)}${ordinaryCss}`)).run()
  await bench('absolute resource after ordinary CSS', () => hasCssLocationDependencies(`${ordinaryCss}.icon{background:url(/icon.svg)}`)).run()
})
