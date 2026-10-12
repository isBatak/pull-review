import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { tinyjs: expected } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).pinned
let output = ''
try {
  output = execFileSync('tinyjs', ['--version'], { encoding: 'utf8' })
}
catch {
  console.error(`tinyjs is not installed. Install the reviewed version with:\n  curl -fsSL https://tinyjs.app/install | TINYJS_VERSION=v${expected} sh`)
  process.exit(1)
}
const installed = /tinyjs v(\d+\.\d+\.\d+)/.exec(output)?.[1]
if (installed !== expected) {
  console.error(`tinyjs ${installed ?? 'unknown'} is installed, but this project is pinned to ${expected}.`)
  console.error(`Read the tinyjs changes before moving the pin in package.json. To install the pinned version:\n  curl -fsSL https://tinyjs.app/install | TINYJS_VERSION=v${expected} sh`)
  process.exit(1)
}
