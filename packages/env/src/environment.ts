import type { FrameworkEnv } from './types'
import process from 'node:process'

export function getProcessEnv(): FrameworkEnv {
  return {
    MPX_CLI_MODE: process.env['MPX_CLI_MODE'],
    MPX_CURRENT_TARGET_MODE: process.env['MPX_CURRENT_TARGET_MODE'],
    NODE_PATH: process.env['NODE_PATH'],
    TARO_ENV: process.env['TARO_ENV'],
    UNI_PLATFORM: process.env['UNI_PLATFORM'],
    UNI_UTS_PLATFORM: process.env['UNI_UTS_PLATFORM'],
    WEAPP_TAILWINDCSS_TARGET: process.env['WEAPP_TAILWINDCSS_TARGET'],
    WEAPP_TW_TARGET: process.env['WEAPP_TW_TARGET'],
  }
}
