import selectorParser from 'postcss-selector-parser';

/** 复用现有 CSS 标识符解析，拒绝显式映射中的非法变量名。 */
export function isCustomPropertyName(name: string): boolean {
  if (/^--[\w-]+$/.test(name)) return true;
  try {
    const selectors = selectorParser().astSync(`#${name}`);
    const nodes = selectors.first?.nodes.filter(node => node.type !== 'comment');
    const identifier = nodes?.[0];
    return selectors.nodes.length === 1
      && nodes?.length === 1
      && identifier?.type === 'id'
      && identifier.value.startsWith('--')
      && identifier.value.length > 2;
  } catch {
    return false;
  }
}
