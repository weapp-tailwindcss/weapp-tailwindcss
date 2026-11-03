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

/** 先合成完整源码，再由调用方将变更与本轮 marker 一次保存。 */
export function applyHmrSourceMutation(source: string, mutation: HmrSourceMutation) {
  let nextSource = source
  let replacementApplied = false
  if (mutation.replace) {
    if (source.includes(mutation.replace.from)) {
      nextSource = source.replace(mutation.replace.from, mutation.replace.to)
      replacementApplied = true
    }
    else if (!source.includes(mutation.replace.to)) {
      throw new Error(`HMR 源码变更找不到替换目标：${mutation.file}`)
    }
  }
  if (typeof mutation.append === 'string') {
    const appended = `${mutation.append.trimEnd()}\n`
    // 中断后重试整组变更时，保留已经交付的追加块，marker 仍可继续保存。
    if (!mutation.replace || replacementApplied || !nextSource.endsWith(appended)) {
      nextSource = `${nextSource}${nextSource.endsWith('\n') ? '' : '\n'}${appended}`
    }
  }
  else if (!mutation.replace && mutation.touch) {
    nextSource = `${source}${source.endsWith('\n') ? '' : '\n'}\n`
  }
  else if (!mutation.replace) {
    throw new Error(`HMR 源码变更缺少 append、replace 或 touch：${mutation.file}`)
  }
  return nextSource
}

export async function appendHmrSourceMutation(projectRoot: string, mutation: HmrSourceMutation, writeSource = async (target: string, content: string) => fs.writeFile(target, content, 'utf8')) {
  const file = path.resolve(projectRoot, mutation.file)
  const source = await readUtf8(file)
  await writeSource(file, applyHmrSourceMutation(source, mutation))
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
