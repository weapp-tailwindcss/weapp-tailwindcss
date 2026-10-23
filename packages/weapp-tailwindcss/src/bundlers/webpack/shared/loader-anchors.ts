export interface LoaderEntry { loader?: string }

const CSS_PREPROCESSOR_RE = /(?:^|[/\\])(?:sass|less|stylus)-loader(?:[/\\]|(?:\.[cm]?js)?$)/

export function findCssPreprocessorIndex(entries: LoaderEntry[]) {
  return entries.findIndex(entry => CSS_PREPROCESSOR_RE.test(entry.loader ?? ''))
}

export interface LoaderAnchorFinders {
  findRewriteAnchor: (entries: LoaderEntry[]) => number
  findClassSetAnchor: (entries: LoaderEntry[]) => number
}

export function createFinder(targets: string[]) {
  return (entries: LoaderEntry[]) => entries.findIndex(entry =>
    targets.some(target => entry?.loader?.includes?.(target)),
  )
}

export function createPrioritizedFinder(targets: string[]) {
  return (entries: LoaderEntry[]) => {
    for (const target of targets) {
      const idx = entries.findIndex(entry => entry?.loader?.includes?.(target))
      if (idx !== -1) {
        return idx
      }
    }
    return -1
  }
}

export function createDefaultLoaderAnchorFinders(): LoaderAnchorFinders {
  const fallbackFinder = createPrioritizedFinder(['postcss-loader', 'css-loader'])
  return {
    findRewriteAnchor: fallbackFinder,
    findClassSetAnchor: fallbackFinder,
  }
}
