import process from 'node:process'
import { execa } from 'execa'

export function gradleJavaArgs(env = process.env) {
  const javaHome = env['LYNX_JAVA_HOME'] ?? env['JAVA_HOME']
  return javaHome ? [`-Dorg.gradle.java.home=${javaHome}`] : []
}

export async function command(name: string, args: string[], cwd: string, timeout = 300_000) {
  const javaHome = process.env['LYNX_JAVA_HOME']
  const isGradle = name === (process.env['LYNX_GRADLE'] ?? 'gradle')
  const result = await execa(name, isGradle ? [...gradleJavaArgs(), ...args] : args, {
    all: true,
    cwd,
    ...(isGradle && javaHome ? { env: { JAVA_HOME: javaHome } } : {}),
    timeout,
  })
  return result.all ?? ''
}
