import type { AppCase } from './cases'
import fs from 'node:fs/promises'
import path from 'node:path'

type AppOutputFiles = Pick<AppCase, 'transformedFiles' | 'transformedOutputFiles' | 'hmrTransformedOutputFiles'>

export function resolveAppTransformedFiles(projectRoot: string, outputRoot: string, item: AppOutputFiles) {
  return [
    ...(item.transformedFiles ?? []).map(file => path.resolve(projectRoot, file)),
    ...(item.transformedOutputFiles ?? []).map(file => path.resolve(outputRoot, file)),
  ]
}

async function readExistingFiles(files: string[]) {
  try {
    return (await Promise.all(files.map(file => fs.readFile(file, 'utf8')))).join('\n')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export function readExistingAppTransformedOutput(projectRoot: string, outputRoot: string, item: AppOutputFiles) {
  return readExistingFiles(resolveAppTransformedFiles(projectRoot, outputRoot, item))
}

export function readExistingAppHmrTransformedOutput(projectRoot: string, outputRoot: string, item: AppOutputFiles) {
  // 删除断言只检查被修改组件，其他页面可以继续合法消费同一个类。
  const files = item.hmrTransformedOutputFiles?.length
    ? item.hmrTransformedOutputFiles.map(file => path.resolve(outputRoot, file))
    : resolveAppTransformedFiles(projectRoot, outputRoot, item)
  return readExistingFiles(files)
}
