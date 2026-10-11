import type { BundleSnapshot } from '../bundle-state'
import path from 'node:path'
import { normalizeOutputPathKey } from '../../shared/module-graph'

const MINI_PROGRAM_TEMPLATE_OUTPUT_EXT_RE = /\.(?:wxml|axml|jxml|ksml|ttml|qml|qxml|tyml|xhsml|swan)$/i
const JS_STYLE_IMPORT_RE = /\b(?:import|require)\s*(?:\(\s*)?["']([^"']+\.(?:css|less|sass|scss|styl|stylus|pcss|postcss))(?:[?#][^"']*)?["']/g

function addSiblingCssFile(files: Set<string>, file: string, extensionByStem: Map<string, string>, fallbackExtension: string) {
  const cleanFile = file.replace(/[?#].*$/, '')
  const templateMatch = cleanFile.match(MINI_PROGRAM_TEMPLATE_OUTPUT_EXT_RE)
  if (templateMatch?.[0]) {
    const stem = file.slice(0, -templateMatch[0].length)
    files.add(`${stem}${extensionByStem.get(stem) ?? fallbackExtension}`)
  }
  else if (file.endsWith('.js')) {
    const stem = file.slice(0, -'.js'.length)
    files.add(`${stem}${extensionByStem.get(stem) ?? fallbackExtension}`)
  }
}

export function collectCssExtensionByStem(files: string[], cssMatcher: (file: string) => boolean) {
  const extensionByStem = new Map<string, string>()
  for (const file of files) {
    const cleanFile = file.replace(/[?#].*$/, '')
    if (!cssMatcher(cleanFile)) {
      continue
    }
    const extension = path.extname(cleanFile)
    if (!extension || extension === '.css') {
      continue
    }
    extensionByStem.set(file.slice(0, -extension.length), extension)
  }
  return extensionByStem
}

export function collectRuntimeLinkedCssFiles(snapshot: BundleSnapshot, extensionByStem: Map<string, string>, fallbackExtension: string) {
  const files = new Set<string>()
  for (const file of snapshot.runtimeAffectingChangedByType.html) {
    addSiblingCssFile(files, file, extensionByStem, fallbackExtension)
  }
  for (const file of snapshot.runtimeAffectingChangedByType.js) {
    addSiblingCssFile(files, file, extensionByStem, fallbackExtension)
  }
  return files
}

export function collectJsImportedCssFiles(snapshot: BundleSnapshot) {
  const files = new Set<string>()
  for (const entry of snapshot.entries) {
    if (entry.type !== 'js' || entry.output.type !== 'chunk') {
      continue
    }
    JS_STYLE_IMPORT_RE.lastIndex = 0
    let match = JS_STYLE_IMPORT_RE.exec(entry.source)
    while (match !== null) {
      const request = match[1]
      if (request?.startsWith('.')) {
        files.add(normalizeOutputPathKey(path.posix.join(path.posix.dirname(entry.file), request)))
      }
      match = JS_STYLE_IMPORT_RE.exec(entry.source)
    }
  }
  return files
}
