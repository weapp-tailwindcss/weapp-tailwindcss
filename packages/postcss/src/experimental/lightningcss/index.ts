// 仅导出实验性转换；LightningCSS 引擎由实验入口加载，不进入稳定样式管线。
export { createRootSpecificityReplacer, prepareStyleOptions } from './options'
export { buildChildCombinatorReplacement, createVisitor, type SelectorTransformContext } from './selector-transform'
export { assignNestedSelectors, cloneComponent, cloneComponents, createTypeSelector, matchesHiddenNot, normalizeNestedSelectors, trimCombinators } from './selector-utils'
