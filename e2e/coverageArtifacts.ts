import type { CoverageArtifact } from './coverageReport'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function createCoverageArtifact(repoRoot: string, filePath: string, kind: CoverageArtifact['kind'] = 'other'): Promise<CoverageArtifact> {
  const absolutePath = path.resolve(repoRoot, filePath)
  const relativePath = path.relative(repoRoot, absolutePath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`artifact must be inside repository: ${filePath}`)
  }
  const data = await readFile(absolutePath)
  return {
    path: relativePath,
    sha256: createHash('sha256').update(data).digest('hex'),
    kind,
  }
}
