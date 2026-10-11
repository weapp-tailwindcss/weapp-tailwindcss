import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeExtractFormat,
  normalizeTokenFormat,
  readStringArrayOption,
  readStringOption,
  resolveCliCwd,
  toBoolean,
} from '@/helpers/options'

describe('cli option helpers', () => {
  let cwd: string

  beforeEach(() => {
    cwd = process.cwd()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.chdir(cwd)
  })

  it('normalizes token output formats', () => {
    expect(normalizeTokenFormat('json')).toBe('json')
    expect(normalizeTokenFormat('lines')).toBe('lines')
    expect(normalizeTokenFormat('grouped-json')).toBe('grouped-json')
    expect(normalizeTokenFormat('table')).toBe('json')
  })

  it('normalizes extract output formats', () => {
    expect(normalizeExtractFormat(undefined)).toBeUndefined()
    expect(normalizeExtractFormat('json')).toBe('json')
    expect(normalizeExtractFormat('lines')).toBe('lines')
    expect(normalizeExtractFormat('grouped-json')).toBeUndefined()
  })

  it('reads trimmed string options and rejects invalid values', () => {
    expect(readStringOption('cwd', undefined)).toBeUndefined()
    expect(readStringOption('cwd', null)).toBeUndefined()
    expect(readStringOption('cwd', ' ./demo ')).toBe('./demo')
    expect(() => readStringOption('cwd', 1)).toThrow(TypeError)
    expect(() => readStringOption('cwd', '   ')).toThrow(TypeError)
  })

  it('reads string array options from scalar and repeated flags', () => {
    expect(readStringArrayOption('entry', undefined)).toBeUndefined()
    expect(readStringArrayOption('entry', [])).toBeUndefined()
    expect(readStringArrayOption('entry', ' src/app.css ')).toEqual(['src/app.css'])
    expect(readStringArrayOption('entry', [' a.css ', null, 'b.css'])).toEqual(['a.css', 'b.css'])
    expect(() => readStringArrayOption('entry', ['a.css', 1])).toThrow(TypeError)
    expect(() => readStringArrayOption('entry', ['a.css', ' '])).toThrow(TypeError)
  })

  it('coerces booleans with fallback semantics', () => {
    expect(toBoolean(true, false)).toBe(true)
    expect(toBoolean(false, true)).toBe(false)
    expect(toBoolean('true', false)).toBe(true)
    expect(toBoolean('false', true)).toBe(false)
    expect(toBoolean(undefined, true)).toBe(true)
    expect(toBoolean('', true)).toBe(false)
    expect(toBoolean('0', false)).toBe(true)
  })

  it('resolves cwd option values', () => {
    expect(resolveCliCwd(undefined)).toBeUndefined()
    expect(resolveCliCwd('/tmp/demo/../demo')).toBe(path.normalize('/tmp/demo'))
    expect(resolveCliCwd('./apps/demo')).toBe(path.resolve(cwd, './apps/demo'))
  })
})
