import postcss from 'postcss'
import { removeTailwindSourceDirectivesRoot } from '../../generator-plugin/local-imports'
import { removeTailwindSourceDirectives } from '../tailwindcss-v4/user-css/directives'
import { stripGeneratorPlaceholderMarkers } from '../tailwindcss-v4/user-css/markers'

function removeTailwindSourceMediaWrappersRoot(root: ReturnType<typeof postcss.parse>) {
  let changed = false
  root.walkAtRules('media', (atRule) => {
    if (!atRule.params.startsWith('source(')) {
      return
    }
    if (atRule.nodes && atRule.nodes.length > 0) {
      atRule.replaceWith(...atRule.nodes)
    }
    else {
      atRule.remove()
    }
    changed = true
  })
  if (changed) {
    root.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove()
      }
    })
  }
  return changed
}

function removeTailwindSourceMediaWrappersFallback(css: string) {
  return css
    .replace(/@media\s+source\([^)]*\)\s*\{\s*\/\*!\s*weapp-tailwindcss generator-placeholder\s*\*\/?\s*\}/gi, '')
    .replace(/@media\s+source\([^)]*\)\s*\{\s*\}/gi, '')
}

export function removeTailwindEntryDirectivesFromCss(css: string, preserveCssLayers = false) {
  try {
    const source = stripGeneratorPlaceholderMarkers(css)
    const root = postcss.parse(source)
    const removedMediaWrappers = removeTailwindSourceMediaWrappersRoot(root)
    const removedTailwindDirectives = removeTailwindSourceDirectivesRoot(root, { preserveCssLayers })
    return removedMediaWrappers || removedTailwindDirectives ? root.toString() : source
  }
  catch {
    const source = removeTailwindSourceMediaWrappersFallback(css)
    return preserveCssLayers ? source : removeTailwindSourceDirectives(source)
  }
}
