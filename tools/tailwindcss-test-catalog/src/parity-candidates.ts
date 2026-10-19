import { colorsAndBackgrounds } from './parity/colorsAndBackgrounds'
import { coreLayout } from './parity/coreLayout'
import { displayAndBox } from './parity/displayAndBox'
import { effectsAndTransforms } from './parity/effectsAndTransforms'
import { environmentVariants } from './parity/environmentVariants'
import { flexGrid } from './parity/flexGrid'
import { modifiersAndArbitrarySyntax } from './parity/modifiersAndArbitrarySyntax'
import { spacingAndSizing } from './parity/spacingAndSizing'
import { stateVariants } from './parity/stateVariants'
import { structuralAndRelationVariants } from './parity/structuralAndRelationVariants'
import { tablesListsSvgAndForms } from './parity/tablesListsSvgAndForms'
import { typography } from './parity/typography'
import { visual } from './parity/visual'

export const tailwindParityCandidateCategories = {
  coreLayout,
  displayAndBox,
  flexGrid,
  spacingAndSizing,
  typography,
  visual,
  colorsAndBackgrounds,
  effectsAndTransforms,
  tablesListsSvgAndForms,
  stateVariants,
  structuralAndRelationVariants,
  environmentVariants,
  modifiersAndArbitrarySyntax,
} satisfies Record<string, string[]>

export const tailwindParityCandidates = [
  ...new Set(Object.values(tailwindParityCandidateCategories).flat()),
]
