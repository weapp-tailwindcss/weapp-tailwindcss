import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { loadTailwindV4DesignSystem, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'

type Format = 'text' | 'json' | 'jsonl'
type DesignSystem = Awaited<ReturnType<typeof loadTailwindV4DesignSystem>> & {
  canonicalizeCandidates: (candidates: string[], options: { collapse: boolean, logicalToPhysical: boolean }) => string[]
  getClassOrder: (candidates: string[]) => Array<[string, bigint | null]>
}

function splitCandidates(input: string) {
  const result: string[] = []
  let token = ''
  let depth = 0
  let quote = ''
  for (const char of input.trim()) {
    if (quote) {
      token += char
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      token += char
      continue
    }
    if (char === '[' || char === '(') {
      depth++
    }
    if (char === ']' || char === ')') {
      depth--
    }
    if (/\s/.test(char) && depth === 0) {
      if (token) {
        result.push(token)
      }
      token = ''
      continue
    }
    token += char
  }
  if (token) {
    result.push(token)
  }
  return result
}

function canonicalize(designSystem: DesignSystem, input: string) {
  const candidates = designSystem.canonicalizeCandidates(splitCandidates(input), { collapse: true, logicalToPhysical: true })
  return designSystem.getClassOrder(candidates).sort(([, a], [, b]) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1).map(([candidate]) => candidate).join(' ')
}

function record(designSystem: DesignSystem, input: string) {
  const output = canonicalize(designSystem, input)
  return { input, output, changed: input !== output }
}

async function load(cssFile: string | undefined, cwd: string) {
  const file = cssFile ? path.resolve(cwd, cssFile) : undefined
  const css = file ? await fs.readFile(file, 'utf8') : '@import "tailwindcss";'
  const source = await resolveTailwindV4Source({ css, base: file ? path.dirname(file) : cwd, cwd, projectRoot: cwd, packageName: 'tailwindcss' })
  return loadTailwindV4DesignSystem(source) as Promise<DesignSystem>
}

export async function runCanonicalize(argv: string[]) {
  let cssFile: string | undefined
  let format: Format = 'text'
  let stream = false
  const inputs: string[] = []
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!
    if (arg === '--css') {
      cssFile = argv[++index]
    }
    else if (arg.startsWith('--css=')) {
      cssFile = arg.slice(6)
    }
    else if (arg === '--format') {
      format = argv[++index] as Format
    }
    else if (arg.startsWith('--format=')) {
      format = arg.slice(9) as Format
    }
    else if (arg === '--stream') {
      stream = true
    }
    else {
      inputs.push(arg)
    }
  }
  if (!['text', 'json', 'jsonl'].includes(format)) {
    throw new Error(`Invalid value for --format: ${format}`)
  }
  const designSystem = await load(cssFile, process.cwd())
  if (stream) {
    const records = []
    for await (const line of createInterface({ input: process.stdin })) {
      const item = record(designSystem, line)
      if (format === 'text') {
        process.stdout.write(`${item.output}\n`)
      }
      else if (format === 'jsonl') {
        process.stdout.write(`${JSON.stringify(item)}\n`)
      }
      else {
        records.push(item)
      }
    }
    if (format === 'json') {
      process.stdout.write(JSON.stringify(records, null, 2))
    }
    return 0
  }
  if (inputs.length === 0) {
    for await (const line of createInterface({ input: process.stdin })) {
      if (line.trim()) {
        inputs.push(line.trim())
      }
    }
  }
  if (inputs.length === 0) {
    throw new Error('No candidate groups provided')
  }
  const records = inputs.map(input => record(designSystem, input))
  const output = format === 'json' ? JSON.stringify(records, null, 2) : format === 'jsonl' ? records.map(item => JSON.stringify(item)).join('\n') : records.map(item => item.output).join('\n')
  process.stdout.write(`${output}\n`)
  return 0
}
