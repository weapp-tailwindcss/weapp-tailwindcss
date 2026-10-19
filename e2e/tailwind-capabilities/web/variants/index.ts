import { combinationVariantProbes } from './combinations'
import { mediaVariantProbes } from './media'
import { pseudoVariantProbes } from './pseudo'
import { stateVariantProbes } from './states'
import { structuralVariantProbes } from './structural'

export const variantWebProbes = [...structuralVariantProbes, ...stateVariantProbes, ...mediaVariantProbes, ...combinationVariantProbes, ...pseudoVariantProbes]
