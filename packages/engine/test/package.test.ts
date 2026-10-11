import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))

describe('published engine contract', () => {
  it('exposes only the root and v4 entries with matching ESM/CJS declarations', () => {
    expect(Object.keys(manifest.exports)).toEqual(['.', './v4'])
    expect(manifest.publishConfig.exports).toBeUndefined()
    expect(manifest.peerDependencies.tailwindcss).toBe('^4.0.0')
    for (const entry of Object.values(manifest.exports) as Array<Record<string, { types: string, default: string }>>) {
      for (const condition of ['import', 'require']) {
        const target = entry[condition]!
        expect(readFileSync(path.resolve(packageRoot, target.types), 'utf8')).not.toMatch(/TailwindV3|tailwindcss-mangle/)
        expect(readFileSync(path.resolve(packageRoot, target.default), 'utf8')).not.toMatch(/generateTailwindV3|tailwindcss-mangle/)
      }
    }
    expect(readdirSync(path.join(packageRoot, 'dist'))).not.toContain('v3')
  })

  it.each(['module', 'commonjs'])('loads and generates through both entries in %s', (format) => {
    const load = format === 'module'
      ? "const engine = await import('@weapp-tailwindcss/engine'); const v4 = await import('@weapp-tailwindcss/engine/v4');"
      : "const engine = require('@weapp-tailwindcss/engine'); const v4 = require('@weapp-tailwindcss/engine/v4');"
    const script = `${load}
      async function main() {
        const assert = (await import('node:assert/strict')).default;
        assert.equal(engine.createTailwindV4Engine, v4.createTailwindV4Engine);
        assert.equal('generateTailwindV3Style' in engine, false);
        assert.equal('generateCustomStyle' in engine, false);
        const source = await engine.resolveTailwindV4Source({ projectRoot: process.cwd(), css: '@import "tailwindcss";' });
        const runtime = engine.createTailwindV4Engine(source);
        const result = await runtime.generate({ candidates: ['flex', 'invalid-utility'] });
        assert(result.css.includes('display: flex'));
        assert.deepEqual([...result.classSet], ['flex']);
        const candidates = await engine.extractSourceCandidates('<template><view class="flex" /></template>', 'vue');
        assert(candidates.includes('flex'));
        const session = engine.createTailwindGenerationSession(source);
        await session.generate({ candidates: ['flex'] });
        session.dispose();
        await assert.rejects(session.generate({ candidates: ['flex'] }), /disposed/);
      }
      main().catch(error => { console.error(error); process.exitCode = 1; });`
    execFileSync(process.execPath, ['--input-type', format, '-e', script], { cwd: packageRoot, stdio: 'pipe' })
  })
})
