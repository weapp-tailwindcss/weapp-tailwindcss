declare function plugin(options?: Partial<{ className: string, target: 'modern' | 'legacy', mode: 'tag' | 'class', classPrefix: string }>): {
  handler: () => void
}

declare namespace plugin {
  const __isOptionsFunction: true
}

export = plugin
