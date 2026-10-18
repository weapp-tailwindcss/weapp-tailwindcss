import { Config } from '@remotion/cli/config'

// 使用软件渲染和 PNG 帧，避免桌面 GPU 截图偶发的整屏瓦片重复。
Config.setChromiumOpenGlRenderer('swangle')
Config.setVideoImageFormat('png')
Config.setConcurrency(1)
