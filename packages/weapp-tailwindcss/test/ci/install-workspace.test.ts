import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INSTALL_ATTEMPTS,
  DEFAULT_INSTALL_TIMEOUT_MS,
  DEFAULT_RETRY_DELAY_MS,
  readInstallConfig,
} from '../../../../scripts/ci/install-workspace.mjs'

describe('CI workspace install guard', () => {
  it('uses bounded retries and accepts positive overrides', () => {
    expect(readInstallConfig({})).toEqual({
      attempts: DEFAULT_INSTALL_ATTEMPTS,
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    })
    expect(readInstallConfig({
      PNPM_INSTALL_ATTEMPTS: '3',
      PNPM_INSTALL_TIMEOUT_MS: '120000',
      PNPM_INSTALL_RETRY_DELAY_MS: '2500',
    })).toEqual({ attempts: 3, timeoutMs: 120000, retryDelayMs: 2500 })
  })

  it('ignores invalid or non-positive overrides', () => {
    expect(readInstallConfig({
      PNPM_INSTALL_ATTEMPTS: '0',
      PNPM_INSTALL_TIMEOUT_MS: '-1',
      PNPM_INSTALL_RETRY_DELAY_MS: 'not-a-number',
    })).toEqual({
      attempts: DEFAULT_INSTALL_ATTEMPTS,
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    })
  })
})
