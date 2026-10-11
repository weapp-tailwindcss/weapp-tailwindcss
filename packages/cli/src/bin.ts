#!/usr/bin/env node
import process from 'node:process'
import { runCli } from './index'

process.title = 'node (@weapp-tailwindcss/cli)'
void runCli().then((exitCode) => {
  process.exitCode = exitCode
})
