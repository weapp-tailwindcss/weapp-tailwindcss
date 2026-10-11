import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const websiteRoot = path.resolve(repositoryRoot, 'website')
const ignoredDirectories = new Set([
  '.compare-dev-weapp',
  '.debug',
  '.turbo',
  '__tests__',
  'dist',
  'node_modules',
  'unpackage',
])

const styleFileRE = /\.(?:css|scss|less|mpx|vue|uvue)$/
const tailwindEntryRE = /@(tailwind\s+(?:base|components|utilities)|import\s+["']tailwindcss(?:\/|["']))/
const directiveRE = /@(config|source)\s+(not\s+)?["']([^"']+)["']/g
const subpackageRoots = ['sub-normal', 'sub-independent'] as const
// Harmony Vapor 最小复现只验证 App 样式注入，不承载小程序分包隔离契约。
const subpackageCoverageExemptDemoProjects = new Set([
  'uni-app-x-vapor-tailwindcss-v4',
])

function stripCssComments(source: string) {
  let output = ''
  let index = 0
  let quote: '"' | '\'' | undefined

  while (index < source.length) {
    const character = source[index]
    const nextCharacter = source[index + 1]

    if (quote) {
      output += character

      if (character === '\\') {
        output += nextCharacter ?? ''
        index += 2
        continue
      }

      if (character === quote) {
        quote = undefined
      }

      index++
      continue
    }

    if (character === '"' || character === '\'') {
      quote = character
      output += character
      index++
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      const commentEnd = source.indexOf('*/', index + 2)
      index = commentEnd === -1 ? source.length : commentEnd + 2
      continue
    }

    if (character === '/' && nextCharacter === '/') {
      const lineEnd = source.indexOf('\n', index + 2)
      index = lineEnd === -1 ? source.length : lineEnd
      continue
    }

    output += character
    index++
  }

  return output
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory)
  const files: string[] = []

  for (const entry of entries) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const absolutePath = path.join(directory, entry)
    const fileStat = await stat(absolutePath)

    if (fileStat.isDirectory()) {
      files.push(...await collectFiles(absolutePath))
    }
    else {
      files.push(absolutePath)
    }
  }

  return files
}

function getDemoProject(relativePath: string) {
  const parts = relativePath.split(path.sep)
  return parts[1] === 'web' ? parts.slice(0, 3).join('/') : parts.slice(0, 2).join('/')
}

function resolveDirectiveBase(file: string, specifier: string) {
  const absolutePath = path.resolve(path.dirname(file), specifier)

  if (!/[*{[]/.test(specifier)) {
    return absolutePath
  }

  const staticBase = absolutePath.split(/[*{[]/)[0] ?? absolutePath
  return staticBase.endsWith(path.sep) ? staticBase.slice(0, -1) : staticBase
}

function getPositiveSourceSpecifiers(source: string) {
  const specifiers: string[] = []

  for (const match of source.matchAll(directiveRE)) {
    const [, kind, negativePrefix, specifier] = match

    if (kind === 'source' && !negativePrefix) {
      specifiers.push(specifier)
    }
  }

  return specifiers
}

function isAllowedSubpackageSourceSpecifier(relativePath: string, specifier: string) {
  if (!relativePath.includes('/sub-') && !relativePath.includes('/module')) {
    return true
  }

  if (specifier.startsWith('../**/*')) {
    return true
  }

  return !specifier.includes('../..')
}

function isWebDemoProject(project: string) {
  return project.startsWith('web/')
}

function getDemoProjectFromDemoRelativePath(relativePath: string) {
  const parts = relativePath.split(path.sep)
  return parts[0] === 'web' ? parts.slice(0, 2).join('/') : parts[0]
}

function hasFile(files: string[], project: string, file: string) {
  return files.includes(path.join(demoRoot, project, file))
}

function hasAnyFile(files: string[], project: string, candidates: string[]) {
  return candidates.some(file => hasFile(files, project, file))
}

function hasSubpackagePage(files: string[], project: string, root: typeof subpackageRoots[number]) {
  const prefix = path.join(demoRoot, project, root, 'pages', 'index')
  const srcPrefix = path.join(demoRoot, project, 'src', root, 'pages', 'index')
  const miniprogramPrefix = path.join(demoRoot, project, 'miniprogram', root, 'pages', 'index')

  return files.some(file => (
    file.startsWith(prefix)
    || file.startsWith(srcPrefix)
    || file.startsWith(miniprogramPrefix)
  ))
}

function getSubpackageConfigCandidates(root: typeof subpackageRoots[number]) {
  const suffix = root === 'sub-normal' ? 'sub-normal' : 'sub-independent'
  return [
    `tailwind.config.${suffix}.js`,
    `tailwind.config.${suffix}.cjs`,
    `tailwind.config.${suffix}.mjs`,
    `tailwind.config.${suffix}.ts`,
  ]
}

function projectDeclaresSubpackage(source: string, root: typeof subpackageRoots[number]) {
  return source.includes(`"root": "${root}"`)
    || source.includes(`'root': '${root}'`)
    || source.includes(`root: '${root}'`)
    || source.includes(`root: "${root}"`)
}

describe('demo Tailwind path directives', () => {
  it('keeps every Tailwind CSS entry using resolvable @config and @source directives', async () => {
    const files = await collectFiles(demoRoot)
    const entries: Array<{
      file: string
      project: string
      source: string
    }> = []

    for (const file of files.filter(file => styleFileRE.test(file))) {
      const rawSource = await readFile(file, 'utf8')
      const source = stripCssComments(rawSource)

      if (!tailwindEntryRE.test(source)) {
        continue
      }

      const relativePath = path.relative(path.dirname(demoRoot), file)

      entries.push({
        file,
        project: getDemoProject(relativePath),
        source,
      })
    }

    expect(entries.length).toBeGreaterThan(0)

    for (const entry of entries) {
      const relativePath = path.relative(path.dirname(demoRoot), entry.file)
      const isV4Demo = entry.project.includes('tailwindcss-v4')

      expect.soft(entry.source, `${relativePath} should use explicit @config`).toMatch(/@config\s+["']/)

      if (isV4Demo) {
        expect.soft(entry.source, `${relativePath} should use explicit @source`).toMatch(/@source\s+(?:not\s+)?["']/)
      }

      for (const match of entry.source.matchAll(directiveRE)) {
        const [, kind, negativePrefix, specifier] = match

        if (kind === 'source' && negativePrefix) {
          continue
        }

        const resolvedBase = resolveDirectiveBase(entry.file, specifier)

        expect.soft(
          existsSync(resolvedBase),
          `${relativePath} @${kind} "${specifier}" should resolve from the CSS entry directory`,
        ).toBe(true)
      }
    }
  })

  it('keeps subpackage Tailwind entries scoped to their own config and source roots', async () => {
    const files = await collectFiles(demoRoot)
    const subpackageEntries: Array<{
      relativePath: string
      source: string
    }> = []

    for (const file of files.filter(file => styleFileRE.test(file))) {
      const relativePath = path.relative(demoRoot, file)

      if (!/(?:^|\/)(sub-normal|sub-independent|moduleA|moduleB|moduleC)\/pages\//.test(relativePath)) {
        continue
      }

      const source = stripCssComments(await readFile(file, 'utf8'))

      if (tailwindEntryRE.test(source)) {
        subpackageEntries.push({ relativePath, source })
      }
    }

    expect(subpackageEntries.length).toBeGreaterThan(0)

    for (const entry of subpackageEntries) {
      expect.soft(entry.source, `${entry.relativePath} should use an independent subpackage config`)
        .toMatch(/@config\s+["'][^"']*tailwind\.config\.(?:sub-|module-)/)

      if (entry.relativePath.includes('tailwindcss-v4/')) {
        expect.soft(entry.source, `${entry.relativePath} should use source(none)`)
          .toContain('source(none)')
        const subpackageRoot = subpackageRoots.find(root => entry.relativePath.includes(`/${root}/`))
        if (subpackageRoot) {
          expect.soft(entry.source, `${entry.relativePath} should source the current subpackage root`)
            .toContain(subpackageRoot)
        }

        const positiveSources = getPositiveSourceSpecifiers(entry.source)
        expect.soft(
          positiveSources.every(specifier => isAllowedSubpackageSourceSpecifier(entry.relativePath, specifier)),
          `${entry.relativePath} should not scan beyond its own subpackage root`,
        ).toBe(true)

        expect.soft(positiveSources, `${entry.relativePath} should include the Tailwind CSS entry in source scanning`)
          .toSatisfy((specifiers: string[]) => specifiers.some(specifier => specifier.includes('css')))
      }
    }
  })

  it('keeps every mini-program demo covering normal and independent subpackage styles', async () => {
    const files = await collectFiles(demoRoot)
    const packageJsonFiles = files.filter(file => path.basename(file) === 'package.json')
    const allDemoProjects = packageJsonFiles
      .map(file => getDemoProjectFromDemoRelativePath(path.relative(demoRoot, file)))
      .filter(project => !isWebDemoProject(project))
      .sort()
    const demoProjects = allDemoProjects
      .filter(project => !subpackageCoverageExemptDemoProjects.has(project))

    for (const project of subpackageCoverageExemptDemoProjects) {
      expect(allDemoProjects, `${project} should remain a real demo project`).toContain(project)
    }

    expect(demoProjects.length).toBeGreaterThan(0)

    for (const project of demoProjects) {
      for (const root of subpackageRoots) {
        expect.soft(
          hasSubpackagePage(files, project, root),
          `${project} should include a ${root} page for subpackage style isolation`,
        ).toBe(true)
        expect.soft(
          hasAnyFile(files, project, getSubpackageConfigCandidates(root)),
          `${project} should include an independent Tailwind config for ${root}`,
        ).toBe(true)
      }

      const appConfigCandidates = [
        'app.json',
        'app.json.ts',
        'pages.json',
        'src/app.json',
        'src/app.mpx',
        'src/app.config.ts',
        'src/pages.json',
        'miniprogram/app.json.ts',
      ]
      const appConfig = appConfigCandidates
        .map(file => path.join(demoRoot, project, file))
        .find(file => existsSync(file))

      expect.soft(appConfig, `${project} should have an app/page config declaring subpackages`).toBeTruthy()
      if (!appConfig) {
        continue
      }

      const source = await readFile(appConfig, 'utf8')
      for (const root of subpackageRoots) {
        expect.soft(
          projectDeclaresSubpackage(source, root),
          `${project} should declare ${root} in its app/page config`,
        ).toBe(true)
      }
      expect.soft(
        source.includes('independent'),
        `${project} should include an independent subpackage declaration`,
      ).toBe(true)
    }
  })
})

describe('website Tailwind path directives', () => {
  it('keeps website Tailwind CSS entry using resolvable @config and @source directives', async () => {
    const files = await collectFiles(websiteRoot)
    const entries = []

    for (const file of files.filter(file => styleFileRE.test(file))) {
      const source = stripCssComments(await readFile(file, 'utf8'))

      if (tailwindEntryRE.test(source)) {
        entries.push({ file, source })
      }
    }

    expect(entries.length).toBeGreaterThan(0)

    for (const entry of entries) {
      const relativePath = path.relative(repositoryRoot, entry.file)

      expect.soft(entry.source, `${relativePath} should use explicit @config`).toMatch(/@config\s+["']/)
      expect.soft(entry.source, `${relativePath} should use explicit @source`).toMatch(/@source\s+(?:not\s+)?["']/)

      for (const match of entry.source.matchAll(directiveRE)) {
        const [, kind, negativePrefix, specifier] = match

        if (kind === 'source' && negativePrefix) {
          continue
        }

        const resolvedBase = resolveDirectiveBase(entry.file, specifier)

        expect.soft(
          existsSync(resolvedBase),
          `${relativePath} @${kind} "${specifier}" should resolve from the CSS entry directory`,
        ).toBe(true)
      }
    }
  })
})
