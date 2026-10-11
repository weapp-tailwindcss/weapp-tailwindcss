import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PATCH_COMMAND_OBSOLETE_NOTICE,
  logObsoletePatchCommand,
  logPatchCommandObsoleteNotice,
  obsoletePatchCommands,
} from '@/mount-options'
import { logger } from '@weapp-tailwindcss/logger'

describe('obsolete patch command notices', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
  })

  it('logs v5 obsolete patch notices', () => {
    logPatchCommandObsoleteNotice()
    logObsoletePatchCommand('extract')

    expect(obsoletePatchCommands).toContain('extract')
    expect(logger.warn).toHaveBeenCalledWith(PATCH_COMMAND_OBSOLETE_NOTICE)
    expect(logger.warn).toHaveBeenCalledWith('命令 "extract" 来自旧版 tailwindcss-patch 工作流，当前版本无需执行。')
  })
})
