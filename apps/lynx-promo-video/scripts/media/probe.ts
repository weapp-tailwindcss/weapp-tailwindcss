import { execa } from 'execa'

export interface ProbeResult {
  streams: Array<{ codec_type: string, codec_name: string, width?: number, height?: number, pix_fmt?: string, sample_rate?: string, avg_frame_rate?: string }>
  format: { duration: string }
}

export async function probe(file: string): Promise<ProbeResult> {
  const result = await execa('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])
  return JSON.parse(result.stdout) as ProbeResult
}

export function mediaDuration(metadata: ProbeResult, label: string) {
  const duration = Number(metadata.format.duration)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${label} 缺少有效媒体时长。`)
  }
  return duration
}

export function verifyCaptureVideo(metadata: ProbeResult, label: string, minimumSeconds: number) {
  const video = metadata.streams.find(stream => stream.codec_type === 'video')
  if (!video || video.codec_name !== 'h264' || video.avg_frame_rate !== '30/1') {
    throw new Error(`${label} 必须是 H.264、30 FPS 真实录屏。`)
  }
  const duration = mediaDuration(metadata, label)
  if (duration < minimumSeconds - 1 / 30) {
    throw new Error(`${label} 只有 ${duration} 秒，至少需要 ${minimumSeconds} 秒。`)
  }
  return duration
}

export function rawVideoDuration(metadata: ProbeResult, label: string) {
  if (!metadata.streams.some(stream => stream.codec_type === 'video')) {
    throw new Error(`${label} 缺少原始录屏视频轨道。`)
  }
  return mediaDuration(metadata, label)
}

export function verifyNarration(metadata: ProbeResult, label: string, maximumSeconds: number) {
  if (!metadata.streams.some(stream => stream.codec_type === 'audio')) {
    throw new Error(`${label} 缺少旁白音轨。`)
  }
  const duration = mediaDuration(metadata, label)
  if (duration > maximumSeconds + 0.02) {
    throw new Error(`${label} 旁白 ${duration} 秒超出场景 ${maximumSeconds} 秒。`)
  }
}
