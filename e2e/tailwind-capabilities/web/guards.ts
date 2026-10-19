export type WebGuard
  = { kind: 'style', name: string, selector: string, property: string, pseudo?: string, expected: string, before?: string }
    | { kind: 'matches', name: string, selector: string, condition: string, expected: string, before?: string }
    | { kind: 'media', name: string, query: string, expected: string, before?: string }
    | { kind: 'selection', name: string, expected: string, before?: string }
