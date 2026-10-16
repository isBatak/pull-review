import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { changelogSection, changelogSections, githubAssetUrl, githubReleaseRepo } from '../src/shared/updates'

const MANIFEST_NOTE_VERSIONS = 20

const dryRun = process.argv.includes('--dry-run')
const ci = process.argv.includes('--ci')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function run(command: string, args: string[]) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function output(command: string, args: string[]) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

function succeeds(command: string, args: string[]) {
  try {
    execFileSync(command, args, { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

const pkg = readJson('package.json')
const tiny = readJson('tinyjs.json')
const version: string = pkg.version
const tag = `v${version}`

if (tiny.version !== version)
  fail(`package.json is ${version} but tinyjs.json is ${tiny.version}. Make them match.`)

const repo = githubReleaseRepo(tiny.update?.url ?? '')
if (!repo)
  fail('tinyjs.json "update.url" must be https://github.com/<owner>/<repo>/releases/latest/download/manifest.json')

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const notes = changelogSection(changelog, version)
if (!notes)
  fail(`CHANGELOG.md has no "## ${version}" section with notes.`)

if (!dryRun) {
  if (succeeds('gh', ['release', 'view', tag, '--repo', repo])) {
    if (ci) {
      console.log(`Release ${tag} already exists. Nothing to do.`)
      process.exit(0)
    }
    fail(`Release ${tag} already exists. Bump the version first.`)
  }
  if (output('git', ['status', '--porcelain']))
    fail('Commit or stash your changes first.')
  if (!ci) {
    run('git', ['fetch', '--quiet', 'origin'])
    if (output('git', ['rev-parse', 'HEAD']) !== output('git', ['rev-parse', '@{u}']))
      fail('Push your commits first. The release is made from the pushed commit.')
  }
}

mkdirSync('out', { recursive: true })
const notesFile = 'out/release-notes.md'
writeFileSync(notesFile, `${notes}\n`)

run('node', ['scripts/check-tinyjs.mjs'])
run('pnpm', ['exec', 'tsdown'])
run('tinyjs', ['publish', '--universal', '--notes-file', notesFile])

const zipName = `${tiny.name}-${version}.zip`
const zipPath = `dist/publish/${zipName}`
const manifestPath = 'dist/publish/manifest.json'
const manifest = readJson(manifestPath)
if (manifest.version !== version)
  fail(`dist/publish/manifest.json is for ${manifest.version}, expected ${version}.`)
manifest.url = githubAssetUrl(repo, tag, zipName)
manifest.notes = changelogSections(changelog).slice(0, MANIFEST_NOTE_VERSIONS).map(section => `## ${section.heading}\n\n${section.body}`).join('\n\n')
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

if (dryRun) {
  console.log(`\nDry run. Ready to upload:\n  ${zipPath}\n  ${manifestPath}\n\n${JSON.stringify(manifest, null, 2)}`)
  process.exit(0)
}

run('gh', ['release', 'create', tag, zipPath, manifestPath, '--repo', repo, '--title', version, '--notes-file', notesFile, '--target', output('git', ['rev-parse', 'HEAD'])])

const zipResponse = await fetch(manifest.url, { method: 'HEAD' })
if (!zipResponse.ok)
  fail(`The download link does not work yet (HTTP ${zipResponse.status}): ${manifest.url}`)
const latest = await fetch(tiny.update.url, { headers: { 'cache-control': 'no-cache' } }).then(response => response.json()) as { version?: string }
if (latest.version !== version)
  fail(`The latest manifest still says ${latest.version}. Check that ${tag} is not a draft or pre-release.`)

console.log(`\nReleased ${tag}. Apps will offer the update on their next check.`)
