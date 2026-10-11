import path from 'node:path'

export function sameSourceFile(projectRoot: string, mutationFile: string, sourceFile: string, paths = path) {
  return paths.resolve(projectRoot, mutationFile) === paths.resolve(sourceFile)
}

export function assertServerIdentity(identity: unknown, expectedRoot: string, paths = path) {
  const root = identity && typeof identity === 'object' && 'root' in identity ? identity.root : undefined
  if (typeof root !== 'string' || !paths.isAbsolute(root) || paths.normalize(root) !== paths.normalize(expectedRoot)) {
    throw new Error(`Web 服务身份不匹配：${JSON.stringify(identity)}，预期 ${expectedRoot}`)
  }
}
