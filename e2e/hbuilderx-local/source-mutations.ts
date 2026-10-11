import type { HmrSourceMutation } from './cases'

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'pathe'

import { readUtf8 } from './process'

interface HmrOutputSignature {
  hash: string
  mtimeMs: number
  size: number
}

export type HmrOutputSnapshot = Map<string, HmrOutputSignature>

export async function appendHmrSourceMutation(projectRoot: string, mutation: HmrSourceMutation, writeSource = async (target: string, content: string) => fs.writeFile(target, content, 'utf8')) {
  const file = path.resolve(projectRoot, mutation.file)
  const source = await readUtf8(file)
  const separator = source.endsWith('\n') ? '' : '\n'
  let nextSource: string | undefined
  if (mutation.replace) {
    if (source.includes(mutation.replace.from)) {
      nextSource = source.replace(mutation.replace.from, mutation.replace.to)
    }
    else if (source.includes(mutation.replace.to)) {
      // HMR 测试可能在上次中断后留下目标状态，重复执行时保持幂等。
      return file
    }
    else {
      throw new Error(`HMR 源码变更找不到替换目标：${mutation.file}`)
    }
  }
  else if (typeof mutation.append === 'string') {
    nextSource = `${source}${separator}${mutation.append.trimEnd()}\n`
  }
  else if (mutation.touch) {
    nextSource = `${source}${separator}\n`
  }
  if (nextSource === undefined) {
    throw new Error(`HMR 源码变更缺少 append、replace 或 touch：${mutation.file}`)
  }
  await writeSource(file, nextSource)
  return file
}

export async function createHmrSourceRestore(files: Iterable<string>) {
  const originals = new Map<string, string>()
  for (const file of new Set(files)) {
    originals.set(file, await readUtf8(file))
  }
  return async () => {
    await Promise.all([...originals].map(([file, source]) => fs.writeFile(file, source, 'utf8')))
  }
}

export async function createHmrOutputSnapshot(files: Iterable<string>): Promise<HmrOutputSnapshot> {
  return new Map(await Promise.all([...new Set(files)].map(async (file) => {
    const [stat, content] = await Promise.all([fs.stat(file), fs.readFile(file)])
    return [file, {
      hash: createHash('sha256').update(content).digest('hex'),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    }] as const
  })))
}

export async function haveHmrOutputsChanged(snapshot: HmrOutputSnapshot) {
  return (await Promise.all([...snapshot].map(async ([file, previous]) => {
    const [stat, content] = await Promise.all([fs.stat(file), fs.readFile(file)])
    return stat.mtimeMs !== previous.mtimeMs
      || stat.size !== previous.size
      || createHash('sha256').update(content).digest('hex') !== previous.hash
  }))).every(Boolean)
}
