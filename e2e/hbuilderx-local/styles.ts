import fs from 'node:fs/promises'
import path from 'node:path'
import { collectCssImportRequestsRoot, isLocalCssImportRequest, postcss } from '../../packages/postcss/src/index'

function assertWithinRoot(root: string, file: string, paths: typeof path.posix = path) {
  const relative = paths.relative(root, file)
  if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    throw new Error(`Stylesheet escapes mini-program output root: ${file}; root=${root}`)
  }
}

/** 小程序绝对导入以产物根为基准，不得读取宿主文件系统根目录或产物根以外的文件。 */
export function resolveMiniProgramStyleImport(root: string, importer: string, request: string, paths: typeof path.posix = path) {
  if (!isLocalCssImportRequest(request) || /^[a-z][a-z\d+.-]*:/i.test(request)) {
    return undefined
  }
  const pathname = request.replace(/[?#].*$/, '')
  const target = pathname.startsWith('/')
    ? paths.resolve(root, pathname.slice(1))
    : paths.resolve(paths.dirname(importer), pathname)
  try {
    assertWithinRoot(paths.resolve(root), target, paths)
  }
  catch (cause) {
    throw new Error(`Invalid stylesheet import ${JSON.stringify(request)} from ${importer}: ${target}; ${String(cause)}`, { cause })
  }
  return target
}

export async function collectMiniProgramStyleFiles(root: string, extensions: string[]) {
  const styleFiles: string[] = []
  const normalizedExtensions = new Set(extensions.map(extension => extension.toLowerCase()))

  async function visit(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const target = path.resolve(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(target)
      }
      else if (entry.isFile() && normalizedExtensions.has(path.extname(entry.name).toLowerCase())) {
        styleFiles.push(target)
      }
    }))
  }

  await visit(root)
  return styleFiles.sort()
}

export async function resolveMiniProgramRuntimeStyleEntry(root: string, extensions: string[]) {
  const normalizedExtensions = new Set(extensions.map(extension => extension.toLowerCase()))
  const entries = await fs.readdir(root, { withFileTypes: true })
  const rootChunkStems = new Set(entries.filter(entry =>
    entry.isFile() && ['.js', '.mjs', '.cjs'].includes(path.extname(entry.name).toLowerCase()),
  ).map(entry => path.basename(entry.name, path.extname(entry.name))))
  const candidates = entries.filter(entry =>
    entry.isFile()
    && normalizedExtensions.has(path.extname(entry.name).toLowerCase())
    && rootChunkStems.has(path.basename(entry.name, path.extname(entry.name))),
  )
  return candidates.length === 1 ? path.resolve(root, candidates[0]!.name) : undefined
}

export async function readReachableMiniProgramStyleFiles(root: string, entryFile: string, extensions: string[]) {
  const normalizedRoot = path.resolve(root)
  const normalizedExtensions = new Set(extensions.map(extension => extension.toLowerCase()))
  const visited = new Set<string>()
  const sources: Array<{ file: string, content: string }> = []

  async function visit(file: string) {
    const normalizedFile = path.resolve(file)
    assertWithinRoot(normalizedRoot, normalizedFile)
    if (visited.has(normalizedFile)) {
      return
    }
    visited.add(normalizedFile)
    const source = await fs.readFile(normalizedFile, 'utf8')
    sources.push({ file: normalizedFile, content: source })
    for (const request of collectCssImportRequestsRoot(postcss.parse(source, { from: normalizedFile }))) {
      const importedFile = resolveMiniProgramStyleImport(normalizedRoot, normalizedFile, request)
      if (importedFile && normalizedExtensions.has(path.extname(importedFile).toLowerCase())) {
        try {
          await visit(importedFile)
        }
        catch (cause) {
          throw new Error(`Cannot read stylesheet import ${JSON.stringify(request)} from ${normalizedFile}: ${importedFile}; ${String(cause)}`, { cause })
        }
      }
    }
  }

  await visit(entryFile)
  return sources
}

export async function readReachableMiniProgramStyles(root: string, entryFile: string, extensions: string[]) {
  const sources = await readReachableMiniProgramStyleFiles(root, entryFile, extensions)
  return sources.map(source => source.content).join('\n')
}
