const tau = Math.PI * 2
const chords = [[50, 57, 61, 66], [47, 54, 57, 62], [43, 50, 54, 59], [45, 52, 59, 61]]
const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
const notes = chords.map(chord => chord.map(note))
const sin = Math.sin

function noise(index: number) {
  let value = Math.imul(index ^ 0x45D9F3B, 0x45D9F3B)
  value = Math.imul(value ^ (value >>> 16), 0x45D9F3B)
  return ((value ^ (value >>> 16)) >>> 0) / 2147483648 - 1
}

function pluck(t: number, frequency: number) {
  if (t < 0 || t > 1.6) {
    return 0
  }
  const attack = Math.min(1, t / 0.008)
  return (sin(tau * frequency * t) + sin(tau * frequency * 2 * t) * 0.28 * Math.exp(-8 * t) + sin(tau * frequency * 3 * t) * 0.08 * Math.exp(-12 * t)) * Math.exp(-4.4 * t) * attack
}

export function musicSample(time: number, index: number, seconds: number, transitions: number[], channel: number) {
  const beat = time % 0.5
  const bar = Math.floor(time / 2)
  const chord = notes[Math.floor(bar / 4) % notes.length]
  const energy = time < 3 ? 0.1 : time < 12 ? 0.55 : time < seconds - 6 ? 0.86 : 0.35
  const stereo = channel ? 1.001 : 0.999
  let sample = 0
  // 和弦铺底以不同相位和轻微失谐形成宽度。
  for (const [i, frequency] of chord.entries()) {
    const phase = time * tau * frequency * stereo
    sample += (sin(phase + i) + sin(phase * 2.001 + channel) * 0.13) * 0.024 * (0.78 + sin(time * 0.24 + i) * 0.12)
  }
  const bass = chord[0] / 2
  const bassEnvelope = (1 - Math.exp(-beat * 30)) * Math.exp(-beat * 3)
  sample += sin(tau * bass * time) * bassEnvelope * 0.12 * energy
  // 八分音符琶音与两次衰减延迟。
  for (let echo = 0; echo < 3; echo++) {
    const delayed = time - echo * 0.375
    if (delayed < 4 || delayed > seconds - 3) {
      continue
    }
    const step = Math.floor(delayed / 0.25)
    const local = delayed - step * 0.25
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    const frequency = chord[pattern[step % 8]] * (step % 8 === 6 ? 4 : 2)
    sample += pluck(local, frequency * stereo) * 0.085 * energy * (echo === 0 ? 1 : 0.3 ** echo)
  }
  if (time > 4 && time < seconds - 5) {
    const kick = sin(tau * (43 * beat + 5 * (1 - Math.exp(-beat * 32)))) * Math.exp(-beat * 16)
    sample += kick * 0.2 * energy
    const eighth = time % 0.25
    const highNoise = (noise(index) - noise(index - 1)) * 0.5
    sample += highNoise * Math.exp(-eighth * 105) * 0.028 * energy
    const snareTime = time % 1 - 0.5
    if (snareTime >= 0) {
      sample += (highNoise * 0.62 + sin(tau * 190 * snareTime) * 0.15) * Math.exp(-snareTime * 28) * 0.065 * energy
    }
  }
  // 转场使用短促上扬与轻柔落点，不覆盖旁白。
  for (const cut of transitions) {
    const local = time - cut
    if (local > -0.45 && local < 0) {
      const swell = (local + 0.45) / 0.45
      sample += sin(tau * (420 * local + 460 * local * local)) * swell ** 2 * 0.027
    }
    if (local >= 0 && local < 0.8) {
      sample += (sin(tau * 659.25 * local) + sin(tau * 987.77 * local) * 0.3) * Math.exp(-local * 8) * 0.038
    }
  }
  const fade = Math.min(1, time / 1.1, Math.max(0, seconds - time) / 1.8)
  return Math.tanh(sample * 1.5) * fade
}
