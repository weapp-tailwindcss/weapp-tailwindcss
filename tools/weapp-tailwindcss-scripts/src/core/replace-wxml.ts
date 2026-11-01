import * as sharedModule from '../../../../packages/weapp-tailwindcss/src/wxml/shared'

const shared = (sharedModule as typeof sharedModule & {
  'default'?: typeof sharedModule
  'module.exports'?: typeof sharedModule
}).default ?? (sharedModule as typeof sharedModule & {
  'module.exports'?: typeof sharedModule
})['module.exports'] ?? sharedModule

export const replaceWxml = shared.replaceWxml
