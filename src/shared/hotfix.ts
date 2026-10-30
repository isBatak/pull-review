export const HOTFIX_SOURCE_BRANCH = 'develop'

export interface ReleaseTag {
  kind: string
  app: string
  base: string
  build: number | null
}

export interface HotfixCommit {
  sha: string
  shortId: string
  title: string
  description: string
  author: string
  authoredAt: string
  webUrl: string
}

export interface HotfixInput {
  tag: string
  commits: string[]
  version: string
  packageDir: string
  returnTo?: string | null
}

export type HotfixStepId = 'fetch' | 'checkout' | `pick:${string}` | 'version' | 'diff' | 'commit' | 'tag' | 'push' | 'return'

export interface HotfixStep {
  id: HotfixStepId
  title: string
  detail: string
  args: string[]
}

export interface HotfixPlan {
  input: HotfixInput
  repoPath: string
  remote: string
  rcTag: string
  steps: HotfixStep[]
}

const RELEASE_TAG = /^([a-z]+)-([a-z][a-z0-9-]*?)-(\d+\.\d+\.\d+)(?:-(\d+))?$/
const VERSION = /^\d+\.\d+\.\d+-\d+$/
const SHA = /^[0-9a-f]{7,40}$/i
const SAFE_REF = /^[\w.][\w./-]*$/

export function isSafeBranch(name: string) {
  return SAFE_REF.test(name)
}

export function parseReleaseTag(tag: string): ReleaseTag | null {
  const match = RELEASE_TAG.exec(tag)
  if (!match)
    return null
  const [, kind, app, base, build] = match as unknown as [string, string, string, string, string | undefined]
  return { kind, app, base, build: build === undefined ? null : Number(build) }
}

export function rcTagPrefix(tag: ReleaseTag) {
  return `rc-${tag.app}-${tag.base}-`
}

export function nextHotfixVersion(tag: ReleaseTag, existingTags: string[]) {
  const prefix = rcTagPrefix(tag)
  const builds = existingTags
    .filter(name => name.startsWith(prefix))
    .map(name => Number(name.slice(prefix.length)))
    .filter(Number.isInteger)
  return `${tag.base}-${Math.max(tag.build ?? 0, ...builds) + 1}`
}

export function defaultPackageDir(tag: ReleaseTag) {
  return `apps/frontend/${tag.app}`
}

export function validateHotfixInput(input: HotfixInput): string | null {
  const tag = parseReleaseTag(input.tag)
  if (!tag)
    return `${input.tag} does not look like a release tag, such as stable-app-0.193.0.`
  if (!input.commits.length)
    return 'Pick at least one commit to cherry-pick.'
  if (!input.commits.every(sha => SHA.test(sha)))
    return 'Each commit must be a commit ID.'
  if (!VERSION.test(input.version))
    return 'The version must look like 0.193.0-1.'
  if (!input.version.startsWith(`${tag.base}-`))
    return `The version must start with ${tag.base}-, the version of ${input.tag}.`
  if (!SAFE_REF.test(input.packageDir) || input.packageDir.split('/').includes('..'))
    return 'The package folder must be a path inside the repository, such as apps/frontend/app.'
  if (input.returnTo && !isSafeBranch(input.returnTo))
    return `${input.returnTo} is not a branch name this flow can switch back to.`
  return null
}

export function buildHotfixPlan(input: HotfixInput, repoPath: string, remote: string): HotfixPlan {
  const tag = parseReleaseTag(input.tag)!
  const rcTag = `rc-${tag.app}-${input.version}`
  const message = `[${tag.app.toUpperCase()} ${input.version}] chore: version packages`
  const steps: HotfixStep[] = [
    { id: 'fetch', title: 'Get the latest tags and commits', detail: `Downloads new tags and branches from ${remote}. Your files are not changed.`, args: ['git', 'fetch', '--tags', remote] },
    { id: 'checkout', title: `Check out ${input.tag}`, detail: `Switches your folder to ${input.tag}, without a branch.`, args: ['git', 'checkout', '--detach', input.tag] },
    ...input.commits.map((sha): HotfixStep => ({ id: `pick:${sha}`, title: `Cherry-pick ${sha.slice(0, 8)}`, detail: `Copies this commit from ${HOTFIX_SOURCE_BRANCH} on top of ${input.tag}.`, args: ['git', 'cherry-pick', '-x', sha] })),
    { id: 'version', title: `Set the version to ${input.version}`, detail: `Changes the version in ${input.packageDir}/package.json.`, args: ['npm', 'pkg', 'set', `version=${input.version}`, '--prefix', input.packageDir] },
    { id: 'diff', title: 'Check the changes', detail: 'Shows what changed. Nothing is saved yet.', args: ['git', 'diff'] },
    { id: 'commit', title: 'Commit the version change', detail: 'Saves the version change as a commit.', args: ['git', 'commit', '-am', message] },
    { id: 'tag', title: `Create the tag ${rcTag}`, detail: 'Marks the last commit with the release candidate tag. It is only on your computer for now.', args: ['git', 'tag', rcTag] },
    { id: 'push', title: `Push ${rcTag} to GitLab`, detail: 'Sends the tag to GitLab, which starts the release candidate pipeline. This can not be undone from here.', args: ['git', 'push', remote, rcTag] },
    ...(input.returnTo ? [{ id: 'return', title: `Go back to ${input.returnTo}`, detail: `Switches your folder back to the branch you were on. The hotfix stays safe in ${rcTag}.`, args: ['git', 'checkout', input.returnTo] } satisfies HotfixStep] : []),
  ]
  return { input, repoPath, remote, rcTag, steps }
}

export function formatCommand(args: string[]) {
  return args.map(arg => (/^[\w./=:@-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, '\\$1')}"`)).join(' ')
}

export type ConflictSide = 'tag' | 'commit' | 'edited'

export interface HotfixProgress {
  plan: HotfixPlan
  done: HotfixStepId[]
  conflict: { stepId: HotfixStepId, files: PickConflictFile[] } | null
}

export interface PickConflictFile {
  path: string
  tagDeleted: boolean
  commitDeleted: boolean
}

const UNMERGED = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

export function parseUnmerged(porcelain: string): PickConflictFile[] {
  return porcelain.split('\0').flatMap((entry) => {
    const code = entry.slice(0, 2)
    if (!UNMERGED.has(code))
      return []
    return [{ path: entry.slice(3), tagDeleted: code[0] === 'D', commitDeleted: code[1] === 'D' }]
  })
}

export function describeConflict(file: PickConflictFile) {
  if (file.tagDeleted && file.commitDeleted)
    return 'Deleted on both sides.'
  if (file.tagDeleted)
    return 'The tag does not have this file, but the commit changes it.'
  if (file.commitDeleted)
    return 'The tag changed this file, but the commit deletes it.'
  return 'Both the tag and the commit changed the same lines.'
}
