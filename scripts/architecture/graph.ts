export type Graph = Map<string, Set<string>>

/** 返回每个强连通分量的一条实际闭环，便于直接定位引用。 */
export function findCycles(graph: Graph): string[][] {
  let sequence = 0
  const indices = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const active = new Set<string>()
  const cycles: string[][] = []
  function visit(node: string) {
    indices.set(node, sequence)
    low.set(node, sequence++)
    stack.push(node)
    active.add(node)
    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      }
      else if (active.has(next)) {
        low.set(node, Math.min(low.get(node)!, indices.get(next)!))
      }
    }
    if (low.get(node) !== indices.get(node)) {
      return
    }
    const component = new Set<string>()
    let member: string
    do {
      member = stack.pop()!
      active.delete(member)
      component.add(member)
    } while (member !== node)
    if (component.size > 1 || graph.get(node)?.has(node)) {
      const chain = findPath(graph, node, candidate => candidate === node, component, true)
      if (chain) {
        cycles.push(chain)
      }
    }
  }
  for (const node of graph.keys()) {
    if (!indices.has(node)) {
      visit(node)
    }
  }
  return cycles
}

/** 广度优先搜索完整违规路径，包括经聚合导出形成的间接依赖。 */
export function findPath(graph: Graph, start: string, target: (node: string) => boolean, allowed?: Set<string>, requireEdge = false): string[] | undefined {
  const queue: string[][] = [[start]]
  const visited = new Set([start])
  for (let index = 0; index < queue.length; index++) {
    const chain = queue[index]!
    const node = chain[chain.length - 1]!
    if ((!requireEdge || chain.length > 1) && target(node)) {
      return chain
    }
    for (const next of graph.get(node) ?? []) {
      if (allowed && !allowed.has(next)) {
        continue
      }
      if (target(next)) {
        return [...chain, next]
      }
      if (!visited.has(next)) {
        visited.add(next)
        queue.push([...chain, next])
      }
    }
  }
}
