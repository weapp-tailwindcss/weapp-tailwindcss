import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { transform } from 'lightningcss'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import { parseBuildArgs } from './build/args'
import { validateBuildPaths } from './build/paths'
import { watchBuildInputs } from './build/watch'
import { runCanonicalize } from './canonicalize'

const DEFAULT_INPUT = '@import "tailwindcss";'

async function drainStdin() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString()
}

async function writeFile(file: string, content: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
}

function sourceMapComment(value: string) {
  return `/*# sourceMappingURL=${value} */`
}

async function buildOnce(options: ReturnType<typeof parseBuildArgs>, stdinCss?: string) {
  validateBuildPaths(options)
  const inputCss = options.input === '-'
    ? (stdinCss ?? await drainStdin())
    : options.input
      ? await fs.readFile(options.input, 'utf8')
      : DEFAULT_INPUT
  const base = options.input && options.input !== '-' ? path.dirname(options.input) : options.cwd
  const sourceOptions = {
    base,
    projectRoot: options.cwd,
    cwd: options.cwd,
    packageName: 'tailwindcss',
  }
  const source = await resolveTailwindV4Source({ ...sourceOptions, css: inputCss })
  const generator = createWeappTailwindcssGenerator(source)
  try {
    const outputPath = options.output && options.output !== '-' ? path.resolve(options.output) : undefined
    const result = await generator.generate({
      target: options.target,
      scanSources: true,
      scanMode: 'compiled',
      excludeFiles: outputPath ? [outputPath] : [],
      incrementalCache: false,
    })
    let css = result.css
    let map: Uint8Array | undefined
    if (options.minify || options.optimize || options.map) {
      const transformed = transform({
        filename: options.input && options.input !== '-' ? path.basename(options.input) : 'input.css',
        code: Buffer.from(css),
        minify: options.minify,
        sourceMap: Boolean(options.map),
      })
      css = Buffer.from(transformed.code).toString()
      map = transformed.map || undefined
    }
    if (options.map && map) {
      if (options.map === true) {
        css += `\n${sourceMapComment(`data:application/json;base64,${Buffer.from(map).toString('base64')}`)}`
      }
      else {
        const mapBase = options.output && options.output !== '-' ? path.dirname(options.output) : options.cwd
        css += `\n${sourceMapComment(path.relative(mapBase, options.map))}`
      }
    }
    return {
      css,
      map,
      dependencies: new Set([
        ...(options.input && options.input !== '-' ? [options.input] : []),
        ...source.dependencies,
        ...result.dependencies,
      ]),
    }
  }
  finally {
    generator.dispose?.()
  }
}

async function runBuild(argv: string[]) {
  const options = parseBuildArgs(argv)
  if (!options.silent) {
    process.stderr.write(`tailwindcss v${process.env['npm_package_version'] ?? ''}\n\n`)
  }
  const stdinCss = options.input === '-' ? await drainStdin() : undefined
  let previous = ''
  const rebuild = async () => {
    const result = await buildOnce(options, stdinCss)
    validateBuildPaths(options)
    if (typeof options.map === 'string' && result.map) {
      await writeFile(options.map, result.map)
    }
    if (result.css !== previous) {
      if (options.output && options.output !== '-') {
        await writeFile(options.output, result.css)
      }
      else {
        process.stdout.write(`${result.css}\n`)
      }
      previous = result.css
    }
    return result.dependencies
  }
  if (!options.watch || (options.input === '-' && options.watch !== 'always')) {
    await rebuild()
    return 0
  }
  await watchBuildInputs({
    cwd: options.cwd,
    interval: options.pollInterval,
    mode: options.watchMode,
    outputs: [options.output, typeof options.map === 'string' ? options.map : undefined].filter((file): file is string => Boolean(file && file !== '-')),
    rebuild,
  })
  return 0
}

export async function runTailwindCli(rawArgv: string[]) {
  if (rawArgv[0] === 'canonicalize') {
    return runCanonicalize(rawArgv.slice(1))
  }
  return runBuild(rawArgv[0] === 'build' ? rawArgv.slice(1) : rawArgv)
}
