export interface LoaderEntry { loader?: string }

const CSS_PREPROCESSOR_RE = /(?:^|[/\\])(?:sass|less|stylus)-loader(?:[/\\]|(?:\.[cm]?js)?$)/

export function findCssPreprocessorIndex(entries: LoaderEntry[]) {
  return entries.findIndex(entry => CSS_PREPROCESSOR_RE.test(entry.loader ?? ''))
}

export interface LoaderAnchorFinders {
  findRewriteAnchor: (entries: LoaderEntry[]) => number
  findClassSetAnchor: (entries: LoaderEntry[]) => number
}

const MPX_STRIP_CONDITIONAL_LOADER = '@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader'
const MPX_STYLE_COMPILER_LOADER = '@mpxjs/webpack-plugin/lib/style-compiler/index'
const MPX_REWRITE_PRECEDENCE_LOADERS = [
  MPX_STYLE_COMPILER_LOADER,
  MPX_STRIP_CONDITIONAL_LOADER,
]

function createFinder(targets: string[]) {
  return (entries: LoaderEntry[]) => entries.findIndex(entry =>
    targets.some(target => entry?.loader?.includes?.(target)),
  )
}

function createPrioritizedFinder(targets: string[]) {
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

export function createMpxLoaderAnchorFinders(): LoaderAnchorFinders {
  // Rewrite should run before style-compiler (and strip-conditional as fallback);
  // class-set should still run after style-compiler.
  return {
    findRewriteAnchor: createPrioritizedFinder(MPX_REWRITE_PRECEDENCE_LOADERS),
    findClassSetAnchor: createFinder([MPX_STYLE_COMPILER_LOADER]),
  }
}

export function createDefaultLoaderAnchorFinders(): LoaderAnchorFinders {
  const fallbackFinder = createPrioritizedFinder(['postcss-loader', 'css-loader'])
  return {
    findRewriteAnchor: fallbackFinder,
    findClassSetAnchor: fallbackFinder,
  }
}
