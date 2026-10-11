import { describe, expect, it, vi } from 'vitest'
import {
  logPatchCommandObsoleteNotice,
  PATCH_COMMAND_OBSOLETE_NOTICE,
} from '@/mount-options'
import { logger } from '@weapp-tailwindcss/logger'

vi.mock('@weapp-tailwindcss/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

describe('cli patch notice', () => {
  it('tells v5 users that the patch command is obsolete', () => {
    logPatchCommandObsoleteNotice()

    expect(logger.warn).toHaveBeenCalledWith(PATCH_COMMAND_OBSOLETE_NOTICE)
    expect(PATCH_COMMAND_OBSOLETE_NOTICE).toContain('weapp-tailwindcss@5')
    expect(PATCH_COMMAND_OBSOLETE_NOTICE).toContain('weapp-tw patch 已无需执行')
    expect(PATCH_COMMAND_OBSOLETE_NOTICE).toContain('postinstall')
  })
})
