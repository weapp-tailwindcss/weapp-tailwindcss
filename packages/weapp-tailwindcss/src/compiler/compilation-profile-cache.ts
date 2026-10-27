import type { ResolvedCompilationProfile } from './compilation-profile'
import { ensureCompilerOwnerActive } from './compiler-owner-state'

export interface CompilationProfileRequest {
  platform?: string | undefined
  nativeStyle?: boolean | undefined
  styleTarget?: string | undefined
}

interface ProfileState {
  signature: string
  revision: number
  request?: CompilationProfileRequest
  profile?: ResolvedCompilationProfile
}

const profileStates = new WeakMap<object, ProfileState>()

function isSameRequest(first: CompilationProfileRequest | undefined, second: CompilationProfileRequest) {
  return first?.platform === second.platform && first?.nativeStyle === second.nativeStyle
    && first?.styleTarget === second.styleTarget
}

function currentRevision(owner: object, revision: number) {
  return () => profileStates.get(owner)?.revision === revision
}

/** 每个 owner 只保留最近一个请求的只读配置，阶段覆盖不推进配置版本。 */
export function resolveCachedCompilationProfile(
  owner: object,
  signature: string,
  request: CompilationProfileRequest,
  createProfile: (revision: number) => ResolvedCompilationProfile,
): { profile: ResolvedCompilationProfile, isCurrent: () => boolean } {
  ensureCompilerOwnerActive(owner)
  let state = profileStates.get(owner)
  if (state?.signature !== signature) {
    state = { signature, revision: (state?.revision ?? 0) + 1 }
    profileStates.set(owner, state)
  }
  if (!state.profile || !isSameRequest(state.request, request)) {
    state.profile = createProfile(state.revision)
    state.request = { ...request }
  }
  return { profile: state.profile, isCurrent: currentRevision(owner, state.revision) }
}

/** 由统一关闭协调者在已接收任务排空后清除回调与插件引用。 */
export function disposeCompilationProfileCache(owner: object) {
  profileStates.delete(owner)
}
