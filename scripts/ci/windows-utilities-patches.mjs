import semver from 'semver'

const guardPatch = '@weapp-tailwindcss/postcss@3.3.2'

/** 仅在候选覆盖为另一精确版本时移除历史探针补丁，保留其他补丁的失配门禁。 */
export function removeReplacedPostcssGuardPatch(workspace, candidateVersion) {
  if (typeof candidateVersion !== 'string'
    || semver.valid(candidateVersion) !== candidateVersion
    || candidateVersion === '3.3.2'
    || !Object.hasOwn(workspace.patchedDependencies ?? {}, guardPatch)) {
    return workspace
  }
  const patchedDependencies = { ...workspace.patchedDependencies }
  delete patchedDependencies[guardPatch]
  return { ...workspace, patchedDependencies }
}
