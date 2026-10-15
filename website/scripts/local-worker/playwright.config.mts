import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import baseConfig from '../../playwright.config.mts'

const websiteRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  ...baseConfig,
  testDir: path.join(websiteRoot, 'tests'),
  outputDir: path.join(websiteRoot, 'test-results'),
  reporter: [['html', { outputFolder: path.join(websiteRoot, 'playwright-report'), open: 'never' }]],
  forbidOnly: true,
  workers: 1,
  use: { ...baseConfig.use, headless: true },
  projects: baseConfig.projects?.map(project => ({ ...project, use: { ...project.use, headless: true } })),
  updateSnapshots: 'none',
})
