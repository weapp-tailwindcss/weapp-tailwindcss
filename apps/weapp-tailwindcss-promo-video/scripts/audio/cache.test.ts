import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { voiceCacheValid } from './cache'

describe('配音缓存完整性', () => {
  it('签名、非空声音和有效词边界必须同时存在', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-voice-'))
    const file = path.join(directory, 'voice.mp3')
    const stamp = path.join(directory, 'voice.txt')
    const words = path.join(directory, 'voice.words.json')
    try {
      await fs.writeFile(file, 'audio-fixture')
      await fs.writeFile(stamp, 'en|Jenny|+4%|Build')
      const valid = () => voiceCacheValid(file, stamp, words, 'en|Jenny|+4%|Build', 'Build')
      expect(await valid()).toBe(false)
      await fs.writeFile(words, JSON.stringify([{ text: 'Build', start: 0, end: 1 }]))
      expect(await valid()).toBe(true)
      expect(await voiceCacheValid(file, stamp, words, 'zh|Xiaoxiao', 'Build')).toBe(false)
      await fs.writeFile(words, '{broken')
      expect(await valid()).toBe(false)
      await fs.writeFile(words, JSON.stringify([{ text: 'Wrong', start: 0, end: 1 }]))
      expect(await valid()).toBe(false)
      await fs.writeFile(words, JSON.stringify([{ text: 'Build', start: 0, end: 1 }]))
      await fs.writeFile(file, '')
      expect(await valid()).toBe(false)
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
