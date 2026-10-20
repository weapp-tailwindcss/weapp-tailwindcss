import { withGeneratorFixture } from '../fixture'
import { digest } from '../identity'
import { loadInventory } from '../inventory'
import { registryWebProfile } from './profiles'
import { buildRegistryReference } from './reference'

export async function registryStaticFixture(root: string) {
  const inventory = await loadInventory()
  const profiles = inventory.utilities.map(registryWebProfile)
  const reference = await buildRegistryReference(profiles)
  const output = await withGeneratorFixture(root, reference.productInput, {}, generator => generator.generate({ target: 'web', candidates: profiles.map(profile => profile.candidate), scanSources: false }))
  return { css: output.css, identity: { fixtureHash: digest(profiles), reference: reference.identity, cases: profiles.length } }
}
