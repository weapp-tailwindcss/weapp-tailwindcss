import type { DetectableAppType } from './types'
import path from 'node:path'

interface ScriptToken {
  value: string
  quoted: boolean
  shellAssignment: boolean
}

const ASSIGNMENT_RE = /^[A-Z_]\w*=/iu
const COMMAND_TYPES = new Map<string, DetectableAppType>([
  ['mpx', 'mpx'],
  ['mpx-cli-service', 'mpx'],
  ['taro', 'taro'],
  ['uni', 'uni-app-vite'],
  ['weapp-vite', 'weapp-vite'],
])
const PNPM_VALUE_OPTIONS = new Set(['-C', '--dir', '-F', '--filter', '--filter-prod', '--reporter'])
const PNPM_FLAGS = new Set(['-w', '--workspace-root', '-r', '--recursive', '-s', '--silent'])
const NPX_VALUE_OPTIONS = new Set(['-p', '--package', '--cache', '--userconfig'])
const NPX_FLAGS = new Set(['-y', '--yes', '--no', '--no-install', '-q', '--quiet'])
const ENV_VALUE_OPTIONS = new Set(['-u', '--unset', '-C', '--chdir'])

function readExpansionEnd(script: string, start: number, opening: string, closing: string) {
  let depth = 1
  let quote: string | undefined
  for (let index = start + 2; index < script.length; index++) {
    const character = script[index]
    if (character === '\\' && quote !== '\'') {
      index++
    }
    else if (quote) {
      if (character === quote) {
        quote = undefined
      }
    }
    else if (character === '"' || character === '\'' || character === '`') {
      quote = character
    }
    else if (character === opening) {
      depth++
    }
    else if (character === closing && --depth === 0) {
      return index
    }
  }
  return -1
}

function tokenizeCommands(script: string): ScriptToken[][] {
  const commands: ScriptToken[][] = []
  let command: ScriptToken[] = []
  let value = ''
  let active = false
  let quoted = false
  let shellAssignment = false
  let protectedPrefix = false
  let quote: string | undefined
  function flushToken() {
    if (active) {
      command.push({ value, quoted, shellAssignment })
      value = ''
      active = false
      quoted = false
      shellAssignment = false
      protectedPrefix = false
    }
  }
  function flushCommand() {
    flushToken()
    if (command.length) {
      commands.push(command)
      command = []
    }
  }
  for (let index = 0; index < script.length; index++) {
    const character = script[index]!
    const next = script[index + 1]
    if ((character === '\\' && quote !== '\'' && next && /[\s"'\\$`;&|]/u.test(next))
      || (character === '^' && !quote && next && /[\s"^;&|]/u.test(next))) {
      if (next !== '\n' && next !== '\r') {
        protectedPrefix = true
        value += next
        active = true
      }
      else if (next === '\r' && script[index + 2] === '\n') {
        index++
      }
      index++
    }
    else if (character === '$' && (next === '(' || next === '{') && quote !== '\'') {
      const end = readExpansionEnd(script, index, next, next === '(' ? ')' : '}')
      if (end === -1) {
        return []
      }
      value += script.slice(index, end + 1)
      protectedPrefix = true
      active = true
      index = end
    }
    else if (quote) {
      if (character === quote) {
        quote = undefined
      }
      else {
        value += character
      }
    }
    else if (character === '"' || character === '\'' || character === '`') {
      quote = character
      quoted = true
      protectedPrefix = true
      active = true
      if (character === '`') {
        value += character
      }
    }
    else if (character === '<' && next === '<') {
      // 不解析 here-document，避免将正文误认作后续命令。
      return []
    }
    else if (((character === '>' || character === '<') && next === '&') || (character === '&' && next === '>')) {
      // 重定向中的 & 不划分命令，文件目标仍属于当前命令参数。
      value += character + next
      active = true
      index++
    }
    else if (character === '#' && !active) {
      while (script[index + 1] && script[index + 1] !== '\n') {
        index++
      }
    }
    else if (character === ';' || character === '&' || character === '|' || character === '\n' || character === '\r') {
      flushCommand()
    }
    else if (/\s/u.test(character)) {
      flushToken()
    }
    else {
      // 只有未引用、未转义的变量名和等号构成 shell 赋值；值中的引用不影响此前判定。
      if (character === '=' && !protectedPrefix && ASSIGNMENT_RE.test(`${value}=`)) {
        shellAssignment = true
      }
      value += character
      active = true
    }
  }
  if (quote) {
    return []
  }
  flushCommand()
  return commands
}

function executableName(value: string, allowVersion = false) {
  if (allowVersion && value.startsWith('@')) {
    // Scoped package spec 不能按路径 basename 当作框架命令。
    return value
  }
  const name = path.win32.basename(path.posix.basename(value))
  const executable = /\.(?:cmd|bat|exe)$/iu.test(name)
    ? name.replace(/\.(?:cmd|bat|exe)$/iu, '').toLowerCase()
    : name
  return allowVersion ? executable.replace(/@[^@]+$/u, '') : executable
}

function skipAssignments(tokens: ScriptToken[], index: number, shellPosition = false) {
  // env/cross-env 接收去引用后的参数，shell 命令位置则必须保留赋值前缀的词法信息。
  while (tokens[index] && (shellPosition ? tokens[index]!.shellAssignment : ASSIGNMENT_RE.test(tokens[index]!.value))) {
    index++
  }
  return index
}

function skipOptions(tokens: ScriptToken[], index: number, flags: Set<string>, valueOptions: Set<string>) {
  while (tokens[index]?.value.startsWith('-')) {
    const value = tokens[index]!.value
    if (value === '--') {
      return index + 1
    }
    if (flags.has(value)) {
      index++
    }
    else if (valueOptions.has(value)) {
      if (!tokens[index + 1]) {
        return tokens.length
      }
      index += 2
    }
    else if (value.includes('=') && valueOptions.has(value.slice(0, value.indexOf('=')))) {
      index++
    }
    else {
      return tokens.length
    }
  }
  return index
}

function collectCommands(script: string, detected: Set<DetectableAppType>, depth = 0) {
  if (depth > 8) {
    return
  }
  for (const tokens of tokenizeCommands(script)) {
    let index = skipAssignments(tokens, 0, true)
    let allowVersion = false
    while (tokens[index]) {
      const name = executableName(tokens[index]!.value, allowVersion)
      const appType = COMMAND_TYPES.get(name)
      if (appType) {
        detected.add(appType)
        break
      }
      allowVersion = false
      index++
      if (name === 'cross-env' || name === 'cross-env-shell') {
        index = skipAssignments(tokens, index)
        const payload = tokens[index]
        if (name === 'cross-env-shell' && payload?.quoted) {
          collectCommands(payload.value, detected, depth + 1)
          break
        }
      }
      else if (name === 'env') {
        index = skipOptions(tokens, index, new Set(['-i', '--ignore-environment']), ENV_VALUE_OPTIONS)
        index = skipAssignments(tokens, index)
      }
      else if (name === 'pnpm') {
        index = skipOptions(tokens, index, PNPM_FLAGS, PNPM_VALUE_OPTIONS)
        if (tokens[index]?.value === 'exec' || tokens[index]?.value === 'dlx') {
          const dlx = tokens[index]!.value === 'dlx'
          index++
          index = skipOptions(tokens, index, dlx ? NPX_FLAGS : PNPM_FLAGS, dlx ? NPX_VALUE_OPTIONS : PNPM_VALUE_OPTIONS)
          allowVersion = dlx
        }
      }
      else if (name === 'npx') {
        index = skipOptions(tokens, index, NPX_FLAGS, NPX_VALUE_OPTIONS)
        allowVersion = true
      }
      else {
        break
      }
    }
  }
}

/**
 * 仅识别脚本中明确的命令位置，不执行脚本或推断任意参数中的框架名称。
 */
export function detectFrameworkCommands(script: string): DetectableAppType[] {
  const detected = new Set<DetectableAppType>()
  collectCommands(script, detected)
  return [...detected]
}
