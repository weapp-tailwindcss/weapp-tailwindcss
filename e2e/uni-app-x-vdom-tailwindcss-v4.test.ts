import { getE2EProject } from './projectEntries'
import { defineProjectTest } from './projectTest'

const project = getE2EProject('uni-app-x-vdom-tailwindcss-v4')

defineProjectTest(project, {
  suite: 'e2e',
  fixturesDir: '../demo',
})
