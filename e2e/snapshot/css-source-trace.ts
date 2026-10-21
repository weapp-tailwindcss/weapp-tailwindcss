import { isCssSourceTraceComment, postcss } from '@weapp-tailwindcss/postcss/transform'

export function joinOutputsWithoutCssSourceTraces(outputs: Array<{ name: string, content: string }>) {
  return outputs.map(({ name, content }) => {
    if (!/\.(?:wxss|acss|ttss|qss|jxss|tyss|css)$/i.test(name)) {
      return content
    }
    const root = postcss.parse(content)
    root.walkComments((comment) => {
      if (isCssSourceTraceComment(comment.text)) {
        comment.remove()
      }
    })
    return root.toString()
  }).join('\n')
}

export function collectTracedRootRules(source: string, selectors: ReadonlySet<string>) {
  const rules: string[] = []
  postcss.parse(source).each((node) => {
    if (node.type !== 'rule' || !selectors.has(node.selector)) {
      return
    }
    const previous = node.prev()
    if (previous?.type === 'comment' && isCssSourceTraceComment(previous.text)) {
      rules.push(`${previous.toString()}\n${node.toString()}`)
    }
    else {
      rules.push(node.toString())
    }
  })
  return rules
}
