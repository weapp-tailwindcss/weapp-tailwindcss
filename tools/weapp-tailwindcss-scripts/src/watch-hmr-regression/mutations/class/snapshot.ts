import { formatPath } from '../../cli'

export interface Issue33SnapshotMetadata {
  label: string
  project: string
  mutationKind: string
  roundName: string
  phase: string
  stage: string
  marker: string
  sourceFile: string
  sourceIdentity: string
}

/** 来源身份复用报告的原始值，展示路径不能在验收主机反推来源身份。 */
export function createIssue33SnapshotMetadata(
  context: Omit<Issue33SnapshotMetadata, 'sourceFile' | 'sourceIdentity'>,
  sourceFile: string,
): Issue33SnapshotMetadata {
  return {
    ...context,
    sourceFile: formatPath(sourceFile),
    sourceIdentity: sourceFile,
  }
}
