import type { CommonCommandOptions } from './types'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import semver from 'semver'
import { runTailwindCli } from './build'
import { WEAPP_TW_REQUIRED_NODE_VERSION_RANGE, WEAPP_TW_VERSION } from './constants'
import { formatOutputPath } from './context'
import {
  createDoctorReport,
  formatDoctorReport,
  hasDoctorFailure,
} from './doctor'
import {
  commandAction,
  readStringArrayOption,
  readStringOption,
  resolveCliCwd,
  toBoolean,
} from './helpers'
import { logObsoletePatchCommand, logPatchCommandObsoleteNotice, obsoletePatchCommands, PATCH_COMMAND_OBSOLETE_NOTICE } from './mount-options'
import { generateVscodeIntellisenseEntry } from './vscode-entry'

type CliOptions = CommonCommandOptions & Record<string, boolean | string | string[] | undefined>

function parseLegacyArgs(argv: string[]) {
  const options: CliOptions = {}
  const positional: string[] = []
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === undefined) {
      continue
    }
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
    if (!rawKey) {
      continue
    }
    const key = rawKey.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
    const next = argv[index + 1]
    let value: boolean | string = true
    if (inlineValue !== undefined) {
      value = inlineValue
    }
    else if (next !== undefined && !next.startsWith('-')) {
      index++
      value = next
    }
    const current = options[key]
    if (current === undefined) {
      options[key] = value
    }
    else if (Array.isArray(current)) {
      current.push(String(value))
    }
    else {
      options[key] = [String(current), String(value)]
    }
  }
  return { command: positional[0], options }
}

function printHelp() {
  logger.log(`weapp-tailwindcss

Usage:
  weapp-tw [--input input.css] [--output output.css] [--watch] [options...]
  weapp-tw build [--input input.css] [--output output.css] [--watch] [options...]
  weapp-tw canonicalize [classes...]

Build options:
  -i, --input <file>       Input CSS file (use - for stdin)
  -o, --output <file>      Output CSS file (defaults to stdout)
  -w, --watch[=always]     Watch for changes and rebuild
      --poll[=ms]          Use polling instead of the native watcher (default 250ms)
  -m, --minify             Optimize and minify the output
      --optimize           Optimize without minifying
      --cwd <dir>          Set the working directory
      --map[=<file>]       Generate a source map
      --silent             Suppress non-error build output
      --target <target>    CSS target: web (default) or weapp

Additional commands:
  canonicalize  Canonicalize Tailwind candidate lists
  patch         Deprecated no-op: v5 runtime handles Tailwind CSS automatically
  status        Deprecated no-op: patch status is no longer required
  vscode-entry  Generate a VS Code helper CSS for Tailwind IntelliSense
  doctor        Check project setup for weapp-tailwindcss
`)
}

async function runPatch() {
  logPatchCommandObsoleteNotice()
  logger.success('已跳过：当前版本不需要手动执行 Tailwind CSS patch。')
}

async function runStatus(options: CliOptions) {
  const payload = { required: false, status: 'unnecessary', message: PATCH_COMMAND_OBSOLETE_NOTICE }
  if (toBoolean(options['json'], false)) {
    logger.log(JSON.stringify(payload, null, 2))
    return
  }
  logPatchCommandObsoleteNotice()
  logger.success('无需检查 Tailwind CSS patch 状态。')
}

async function runVscodeEntry(options: CliOptions) {
  const resolvedCwd = resolveCliCwd(options.cwd)
  const baseDir = resolvedCwd ?? process.cwd()
  const cssEntry = readStringOption('css', options['css'])
  if (!cssEntry) {
    throw new Error('Option "--css" is required.')
  }

  const result = await generateVscodeIntellisenseEntry({
    baseDir,
    cssEntry,
    output: readStringOption('output', options['output']),
    sources: readStringArrayOption('source', options['source']),
    force: toBoolean(options['force'], false),
  })
  logger.success(`VS Code helper generated -> ${formatOutputPath(result.outputPath, resolvedCwd)}`)
}

async function runDoctor(options: CliOptions) {
  const resolvedCwd = resolveCliCwd(options.cwd)
  const report = createDoctorReport({ cwd: resolvedCwd })
  logger.log(toBoolean(options['json'], false) ? JSON.stringify(report, null, 2) : formatDoctorReport(report))
  if (hasDoctorFailure(report, toBoolean(options['strict'], false))) {
    process.exitCode = 1
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  if (!semver.satisfies(process.versions.node, WEAPP_TW_REQUIRED_NODE_VERSION_RANGE)) {
    logger.warn(
      `You are using Node.js ${process.versions.node}. For @weapp-tailwindcss/cli, Node.js version ${WEAPP_TW_REQUIRED_NODE_VERSION_RANGE} is required.`,
    )
  }

  const { command, options } = parseLegacyArgs(argv)

  await commandAction(async () => {
    switch (command) {
      case 'patch':
      case 'install':
        await runPatch()
        return
      case 'status':
        await runStatus(options)
        return
      case 'vscode-entry':
        await runVscodeEntry(options)
        return
      case 'doctor':
        await runDoctor(options)
        return
      case 'help':
        printHelp()
        return
      case 'version':
        process.stdout.write(`${WEAPP_TW_VERSION}\n`)
        return
      default:
        if ((obsoletePatchCommands as readonly string[]).includes(command ?? '')) {
          logObsoletePatchCommand(command!)
          return
        }
    }

    if ((argv.includes('--help') || argv.includes('-h')) && command === undefined) {
      printHelp()
      return
    }
    if (argv.includes('--version') || argv.includes('-v')) {
      process.stdout.write(`${WEAPP_TW_VERSION}\n`)
      return
    }
    process.exitCode = await runTailwindCli(argv)
  })()

  return process.exitCode ?? 0
}
