import type { Config } from 'tailwindcss'
import path from 'node:path'
import process from 'node:process'
import { createJiti } from 'jiti'
import { lilconfig } from 'lilconfig'
import { clearConfigModuleCache } from './module-cache.js'
import { defuOverrideArray } from './utils.js'

export interface LoadConfigOptions {
  cwd: string
  config: string
  moduleName: string
}

export type LoadConfigResult = null | {
  filepath: string
  config: Config
  isEmpty?: boolean
}

export async function loadConfig(options?: Partial<LoadConfigOptions>): Promise<LoadConfigResult> {
  const jiti = createJiti(import.meta.url, { moduleCache: true, fsCache: true })
  const load = (filename: string, source: string) => {
    clearConfigModuleCache(filename)
    return jiti.evalModule(source, { filename })
  }
  const { config, cwd, moduleName } = defuOverrideArray<LoadConfigOptions, Partial<LoadConfigOptions>[]>(
    options as LoadConfigOptions,
    {
      cwd: process.cwd(),
      moduleName: 'tailwind',
    },
  )

  const searcher = lilconfig('tailwindcss', {
    searchPlaces: [
      `${moduleName}.config.js`,
      `${moduleName}.config.cjs`,
      `${moduleName}.config.mjs`,
      `${moduleName}.config.ts`,
      `${moduleName}.config.cts`,
      `${moduleName}.config.mts`,
    ],
    loaders: {
      '.js': load,
      '.cjs': load,
      '.mjs': load,
      '.ts': load,
      '.cts': load,
      '.mts': load,
    },
  })

  if (typeof config === 'string' && config) {
    const configPath = path.isAbsolute(config) ? config : path.resolve(cwd, config)
    return await searcher.load(configPath)
  }
  else {
    return await searcher.search(cwd)
  }
}
