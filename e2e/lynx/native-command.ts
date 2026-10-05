import type { CommandDiagnostics } from './native-command-observer'
import process from 'node:process'
import { execa } from 'execa'
import { observeNativeCommand } from './native-command-observer'

export function gradleJavaArgs(env = process.env) {
  const javaHome = env['LYNX_JAVA_HOME'] ?? env['JAVA_HOME']
  return javaHome ? [`-Dorg.gradle.java.home=${javaHome}`] : []
}

export async function command(name: string, args: string[], cwd: string, timeout = 300_000, diagnostics?: CommandDiagnostics) {
  const javaHome = process.env['LYNX_JAVA_HOME']
  const isGradle = name === (process.env['LYNX_GRADLE'] ?? 'gradle')
  const child = execa(name, isGradle ? [...gradleJavaArgs(), ...args] : args, {
    all: true,
    cwd,
    ...(isGradle && javaHome ? { env: { JAVA_HOME: javaHome } } : {}),
    timeout,
  })
  const finish = diagnostics ? observeNativeCommand(child, diagnostics.file) : undefined
  let result
  try {
    result = await child
  }
  catch (error) {
    try {
      await finish?.('failure')
    }
    catch (evidenceError) {
      throw new AggregateError([error, evidenceError], '原生命令失败，且命令诊断无法写入。')
    }
    throw error
  }
  await finish?.('success')
  return result.all ?? ''
}
