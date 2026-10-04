import process from 'node:process'
import { execa } from 'execa'
import { appRoot } from './paths'
import { selection } from './selection'

const args = process.argv.slice(2)
selection(args)
for (const command of ['assets', 'fonts', 'voice', 'music', 'audio']) {
  await execa('pnpm', [command, ...(['voice', 'music', 'audio'].includes(command) ? args : [])], { cwd: appRoot, stdio: 'inherit' })
}
