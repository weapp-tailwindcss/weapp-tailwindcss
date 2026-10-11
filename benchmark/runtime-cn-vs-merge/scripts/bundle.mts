import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import * as esbuild from 'esbuild'
import { collectEnv } from '../src/env'
import { bundlePath, ensureDataDir, packageRoot } from '../src/paths'

interface BundleTarget {
  id: string
  label: string
  source: string
}

const targets: BundleTarget[] = [
  {
    id: 'weapp-cn',
    label: '@weapp-tailwindcss/cn',
    source: `import { cn } from '@weapp-tailwindcss/cn'\nexport const out = cn('p-4', 'p-2')\n`,
  },
  {
    id: 'weapp-merge',
    label: '@weapp-tailwindcss/merge',
    source: `import { twMerge } from '@weapp-tailwindcss/merge'\nexport const out = twMerge('p-4', 'p-2')\n`,
  },
  {
    id: 'weapp-merge-slim',
    label: '@weapp-tailwindcss/merge/slim',
    source: `import { twMerge } from '@weapp-tailwindcss/merge/slim'\nexport const out = twMerge('p-4', 'p-2')\n`,
  },
  {
    id: 'weapp-merge-lite',
    label: '@weapp-tailwindcss/merge/lite',
    source: `import { twJoin } from '@weapp-tailwindcss/merge/lite'\nexport const out = twJoin('p-4', 'p-2')\n`,
  },
  {
    id: 'upstream-cn',
    label: 'cn()',
    source: `import { cn } from 'cn'\nexport const out = cn('p-4', 'p-2')\n`,
  },
  {
    id: 'upstream-cn-twmerge',
    label: 'cn.twMerge',
    source: `import { twMerge } from 'cn'\nexport const out = twMerge('p-4', 'p-2')\n`,
  },
  {
    id: 'upstream-twmerge',
    label: 'tailwind-merge twMerge',
    source: `import { twMerge } from 'tailwind-merge'\nexport const out = twMerge('p-4', 'p-2')\n`,
  },
  {
    id: 'upstream-twmerge-clsx',
    label: 'clsx + tailwind-merge',
    source: `import { clsx } from 'clsx'\nimport { twMerge } from 'tailwind-merge'\nexport const out = twMerge(clsx('p-4', 'p-2'))\n`,
  },
]

async function bundleOne(target: BundleTarget) {
  const dir = join(packageRoot, '.tmp-bundle', target.id)
  mkdirSync(dir, { recursive: true })
  const entry = join(dir, 'entry.mjs')
  const outfile = join(dir, 'out.mjs')
  writeFileSync(entry, target.source)

  try {
    await esbuild.build({
      absWorkingDir: packageRoot,
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'neutral',
      target: ['es2020'],
      outfile,
      logLevel: 'silent',
      legalComments: 'none',
      mainFields: ['module', 'main'],
      conditions: ['import', 'default'],
    })
    const raw = readFileSync(outfile)
    return {
      id: target.id,
      label: target.label,
      rawBytes: raw.byteLength,
      gzipBytes: gzipSync(raw, { level: 9 }).byteLength,
      brotliBytes: brotliCompressSync(raw).byteLength,
    }
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const results = []
  for (const target of targets) {
    results.push(await bundleOne(target))
  }
  ensureDataDir()
  writeFileSync(bundlePath, `${JSON.stringify({ env: collectEnv(), results }, null, 2)}\n`)
  rmSync(join(packageRoot, '.tmp-bundle'), { recursive: true, force: true })
  for (const result of results) {
    console.log(`${result.id}: raw=${result.rawBytes} gzip=${result.gzipBytes} brotli=${result.brotliBytes}`)
  }
  console.log(`bundle written to ${bundlePath}`)
}

await main()
