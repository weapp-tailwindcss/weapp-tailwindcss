import type { TailwindGenerationSessionOptions } from '../src/v4/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTailwindV4EngineGenerationSession } from '../src/v4/generation-session'
import * as nodeAdapter from '../src/v4/node-adapter'

afterEach(() => vi.restoreAllMocks())

describe('prepared generation dependency refresh', () => {
  it.each(['css', 'config'] as const)('refreshes the shared system and preserves %s dependency ownership', async (kind) => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tw-session-prepare-')))
    const dependency = path.join(root, kind === 'css' ? 'theme.css' : 'colors.cjs')
    const source = { projectRoot: root, base: root, baseFallbacks: [], dependencies: [], css: '@import "tailwindcss";' }
    const prepareSource = vi.fn<NonNullable<TailwindGenerationSessionOptions['prepareSource']>>(actual => actual.css)
    const load = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem')
    const session = createTailwindV4EngineGenerationSession(source, { prepareSource })
    try {
      await fs.symlink(path.resolve(__dirname, '../../../node_modules'), path.join(root, 'node_modules'), 'junction')
      await fs.writeFile(path.join(root, 'package.json'), '{"type":"commonjs"}')
      if (kind === 'css') {
        source.css += ' @import "./theme.css";'
        await fs.writeFile(dependency, '@theme { --color-first: red; }')
      }
      else {
        source.css += ' @config "./theme.cjs";'
        await fs.writeFile(path.join(root, 'theme.cjs'), 'module.exports = { theme: { extend: { colors: require("./colors.cjs") } } }')
        await fs.writeFile(dependency, 'module.exports = { first: "red" }')
      }
      const first = await session.generate({ candidates: ['bg-first', 'bg-second'] })
      expect(first.classSet).toEqual(new Set(['bg-first']))
      expect(first.dependencies).toContain(dependency)
      expect(prepareSource.mock.calls[0]![1].getClassOrder?.(['bg-first', 'bg-second'])).toEqual([['bg-first', 0n], ['bg-second', null]])
      await fs.writeFile(dependency, kind === 'css' ? '@theme { --color-second: blue; }' : 'module.exports = { second: "blue" }')
      session.invalidate({ type: 'dependencies', paths: [dependency] })
      const second = await session.generate({ candidates: ['bg-first', 'bg-second'] })
      expect(second.classSet).toEqual(new Set(['bg-second']))
      expect(second.dependencies).toContain(dependency)
      expect(second.fragments[0]?.root.toString()).not.toContain('--color-first')
      expect(second.fragments[0]?.root.toString()).toContain('blue')
      expect(prepareSource.mock.calls[1]![1].getClassOrder?.(['bg-first', 'bg-second'])).toEqual([['bg-first', null], ['bg-second', 0n]])
      expect(load).toHaveBeenCalledTimes(2)
      expect(prepareSource).toHaveBeenCalledTimes(2)
    }
    finally {
      session.dispose()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
