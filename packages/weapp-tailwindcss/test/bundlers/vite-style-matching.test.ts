import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectStyleFileMatchBases,
  scoreMatchingStyleFileBase,
} from '@/bundlers/vite/generate-bundle/style-matching'

const temporaryDirectories: string[] = []

function createDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-style-match-'))
  temporaryDirectories.push(directory)
  return directory
}

function outputPath(value: string) {
  return value.split(path.sep).join('/')
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('Vite style source identities', () => {
  it('uses one physical file identity for repeated roots while preserving relative bases', () => {
    const directory = createDirectory()
    const sourceFile = path.join(directory, 'feature', 'theme.css')
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true })
    fs.writeFileSync(sourceFile, '.theme {}')
    const realpath = vi.spyOn(fs.realpathSync, 'native')

    const bases = collectStyleFileMatchBases(sourceFile, [
      directory,
      directory,
      path.join(directory, '.'),
      path.parse(directory).root,
    ])

    expect(bases.has('feature/theme')).toBe(true)
    expect(bases.has(outputPath(sourceFile.slice(0, -'.css'.length)))).toBe(true)
    expect(realpath.mock.calls.filter(([file]) => file === sourceFile)).toHaveLength(1)
    expect(realpath.mock.calls.filter(([file]) => file === directory)).toHaveLength(1)
  })

  it('resolves missing descendants through a symlink and refreshes the identity next time', () => {
    const directory = createDirectory()
    const original = path.join(directory, 'original')
    const replacement = path.join(directory, 'replacement')
    const alias = path.join(directory, 'alias')
    fs.mkdirSync(original)
    fs.mkdirSync(replacement)
    const linkType = process.platform === 'win32' ? 'junction' : 'dir'
    fs.symlinkSync(original, alias, linkType)
    const missingSource = path.join(alias, 'missing', 'theme.css')

    expect(collectStyleFileMatchBases(missingSource, [original]).has('missing/theme')).toBe(true)

    fs.unlinkSync(alias)
    fs.symlinkSync(replacement, alias, linkType)
    expect(collectStyleFileMatchBases(missingSource, [original]).has('missing/theme')).toBe(false)
    expect(collectStyleFileMatchBases(missingSource, [replacement]).has('missing/theme')).toBe(true)
  })

  it('preserves directory-specific scores with query suffixes and native path separators', () => {
    const directory = createDirectory()
    const sourceRoot = path.join(directory, 'source')
    const outputRoot = path.join(directory, 'output')
    const sourceFile = path.join(sourceRoot, 'feature', 'theme.css')
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true })
    fs.mkdirSync(outputRoot)
    fs.writeFileSync(sourceFile, '.theme {}')

    expect(scoreMatchingStyleFileBase(
      path.join('feature', 'theme.wxss'), `${sourceFile}?vue&type=style`, outputRoot, sourceRoot,
    )).toBe(100000 + 'feature/theme'.length)
    expect(scoreMatchingStyleFileBase(
      path.join('other', 'theme.wxss'), sourceFile, outputRoot, sourceRoot,
    )).toBe(0)
  })

  it('keeps relative inputs lexical and supports the native volume root', () => {
    const directory = createDirectory()
    const realpath = vi.spyOn(fs.realpathSync, 'native')
    const relativeFile = path.join('feature', 'theme.css')

    expect(collectStyleFileMatchBases(relativeFile, [directory, directory])).toEqual(new Set([
      'feature/theme',
      outputPath(path.join(directory, 'feature', 'theme')),
    ]))
    expect(collectStyleFileMatchBases(path.join(directory, 'unresolved.css'), [])).toEqual(new Set([
      outputPath(path.join(directory, 'unresolved')),
    ]))
    expect(realpath).not.toHaveBeenCalled()
    const volumeRoot = path.parse(directory).root
    expect(collectStyleFileMatchBases(volumeRoot, [volumeRoot])).toEqual(new Set([outputPath(volumeRoot)]))
  })
})
