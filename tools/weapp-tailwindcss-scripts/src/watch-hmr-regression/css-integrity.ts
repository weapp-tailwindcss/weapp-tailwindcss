import postcss from 'postcss'

function isKeyframeStepRule(rule: postcss.Rule) {
  return rule.parent?.type === 'atrule' && rule.parent.name.toLowerCase().endsWith('keyframes')
}

export function collectEmptyCssBlocks(source: string) {
  try {
    const root = postcss.parse(source)
    const emptyBlocks: string[] = []
    root.walk((node) => {
      if (
        (node.type === 'atrule' || node.type === 'rule')
        && node.nodes !== undefined
        && node.nodes.every(child => child.type === 'comment')
        && (node.type !== 'rule' || !isKeyframeStepRule(node))
      ) {
        emptyBlocks.push(node.toString())
      }
    })
    return emptyBlocks
  }
  catch {
    return []
  }
}
