import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { resolveFilePath, validateBuildPaths } from './paths'

export interface BuildArgs {
  cwd: string
  input?: string | undefined
  output?: string | undefined
  watch: false | true | 'always'
  watchMode: 'native' | 'poll'
  pollInterval: number
  minify: boolean
  optimize: boolean
  map: false | true | string
  silent: boolean
  target: 'web' | 'weapp'
}

function value(argv: string[], index: number, flag: string) {
  const item = argv[index]
  const inline = item?.startsWith(`${flag}=`) ? item.slice(flag.length + 1) : undefined
  return inline ?? argv[index + 1]
}

export function parseBuildArgs(argv: string[]): BuildArgs {
  let cwd = process.cwd()
  let input: string | undefined
  let output: string | undefined
  let watch: BuildArgs['watch'] = false
  let watchMode: BuildArgs['watchMode'] = 'native'
  let pollInterval = 250
  let minify = false
  let optimize = false
  let map: BuildArgs['map'] = false
  let silent = false
  let target: BuildArgs['target'] = 'web'
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!
    const consumesNext = !arg.includes('=')
    if (arg === '--cwd' || arg.startsWith('--cwd=')) {
      cwd = path.resolve(value(argv, index, '--cwd')!)
      if (consumesNext) {
        index++
      }
    }
    else if (arg === '-i' || arg === '--input' || arg.startsWith('--input=')) {
      input = value(argv, index, arg === '-i' ? '-i' : '--input')
      if (consumesNext) {
        index++
      }
    }
    else if (arg === '-o' || arg === '--output' || arg.startsWith('--output=')) {
      output = value(argv, index, arg === '-o' ? '-o' : '--output')
      if (consumesNext) {
        index++
      }
    }
    else if (arg === '-w' || arg === '--watch') {
      watch = true
    }
    else if (arg.startsWith('--watch=')) {
      const next = value(argv, index, '--watch')
      if (next !== 'always') {
        throw new Error('Option "--watch" only accepts "always".')
      }
      watch = 'always'
    }
    else if (arg === '--poll') {
      watchMode = 'poll'
      pollInterval = 250
    }
    else if (arg.startsWith('--poll=')) {
      watchMode = 'poll'
      pollInterval = Number(value(argv, index, '--poll'))
      if (!Number.isFinite(pollInterval) || pollInterval <= 0) {
        throw new Error('Specified polling interval must be a positive number.')
      }
    }
    else if (arg === '-m' || arg === '--minify') {
      minify = true
    }
    else if (arg === '--optimize') {
      optimize = true
    }
    else if (arg === '--silent') {
      silent = true
    }
    else if (arg === '--map') {
      const next = argv[index + 1]
      if (next && !next.startsWith('-')) {
        if (next === '-') {
          throw new Error('Use --map without a value to inline the source map.')
        }
        map = next
        index++
      }
      else {
        map = true
      }
    }
    else if (arg.startsWith('--map=')) {
      const next = value(argv, index, '--map')
      if (next === '-') {
        throw new Error('Use --map without a value to inline the source map.')
      }
      map = next!
    }
    else if (arg === '--target' || arg.startsWith('--target=')) {
      const next = value(argv, index, '--target')
      if (next !== 'web' && next !== 'weapp') {
        throw new Error('Option "--target" must be "web" or "weapp".')
      }
      target = next
      if (consumesNext) {
        index++
      }
    }
    else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  const resolvePath = (file: string | undefined) => file && file !== '-' ? resolveFilePath(file, cwd) : file
  input = resolvePath(input)
  output = resolvePath(output)
  if (typeof map === 'string') {
    map = path.resolve(cwd, map)
  }
  if (input && input !== '-' && !fs.existsSync(input)) {
    throw new Error(`Specified input file ${input} does not exist.`)
  }
  if (input && input !== '-' && input === output) {
    throw new Error('Specified input and output files are identical.')
  }
  if (target === 'weapp' && map) {
    throw new Error('Option "--map" is only supported when "--target web" is used.')
  }
  validateBuildPaths({ input, output, map })
  return { cwd, input, output, watch, watchMode, pollInterval, minify, optimize, map, silent, target }
}
