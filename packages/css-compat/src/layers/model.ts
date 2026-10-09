import type { Specificity } from '@csstools/selector-specificity'
import type { ChildNode, Declaration, Rule } from 'postcss'

export interface Layer {
  label: string
  children: Map<string | symbol, Layer>
  normal: ChildNode[]
  important: ChildNode[]
  styles: Style[]
}

export interface Style {
  rule: Rule
  specificity: Specificity[]
  declarations: Declaration[]
}

export function createLayer(label: string): Layer {
  return { label, children: new Map(), normal: [], important: [], styles: [] }
}

export function orderedLayers(layer: Layer): Layer[] {
  const layers: Layer[] = []
  const visit = (node: Layer) => {
    for (const child of node.children.values()) {
      visit(child)
    }
    layers.push(node)
  }
  visit(layer)
  return layers
}
