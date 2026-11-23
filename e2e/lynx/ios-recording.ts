import path from 'node:path'
import { execa } from 'execa'

/** 原生滚动完成证据收齐后才停录，失败时同样结束录制并保留原片。 */
export async function recordIosVideo(deviceId: string, artifactDir: string, duration: number, waitForCompletion?: () => Promise<unknown>) {
  const output = path.join(artifactDir, 'raw.mp4')
  const recording = execa('xcrun', ['simctl', 'io', deviceId, 'recordVideo', '--codec=h264', output], { reject: false })
  try {
    await new Promise(resolve => setTimeout(resolve, duration * 1000))
    await waitForCompletion?.()
  }
  finally {
    recording.kill('SIGINT')
    await recording
  }
}
