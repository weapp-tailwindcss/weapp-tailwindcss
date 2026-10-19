import { expect, it } from 'vitest'
import { nativeEvidenceFailureIn, NativeEvidenceUnavailableError, readNativeEvidenceFailure, requestNativeReceipt } from './native-failure'

it('颜色模式恢复等聚合因果链仍能保存取证中断原因', () => {
  const error = new AggregateError([new Error('missing node'), new Error('restore failed', {
    cause: new NativeEvidenceUnavailableError('view-expired', 'View binding expired'),
  })], 'capture and restoration failed')
  expect(nativeEvidenceFailureIn(error)).toMatchObject({ code: 'view-expired', source: 'lynx-native-evidence' })
  const cycle = new Error('cycle')
  cycle.cause = cycle
  expect(nativeEvidenceFailureIn(cycle)).toBeUndefined()
})

it('未知错误码与普通缺节点文本不能提升为环境故障', async () => {
  const unknown = { version: 1, source: 'lynx-native-evidence', category: 'environment', code: 'missing-node', message: 'Missing native geometry' }
  expect(readNativeEvidenceFailure(unknown)).toBeUndefined()
  expect(nativeEvidenceFailureIn(new Error('View binding expired'))).toBeUndefined()
  await expect(requestNativeReceipt(callback => callback(null))).resolves.toBeNull()
})
