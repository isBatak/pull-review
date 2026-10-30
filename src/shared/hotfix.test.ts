import { describe, expect, it } from 'vitest'
import { buildHotfixPlan, formatCommand, nextHotfixVersion, parseReleaseTag, parseUnmerged, validateHotfixInput } from './hotfix'

describe('hotfix', () => {
  it('reads stable and release candidate tags', () => {
    expect(parseReleaseTag('stable-app-0.193.0')).toEqual({ kind: 'stable', app: 'app', base: '0.193.0', build: null })
    expect(parseReleaseTag('rc-app-0.193.0-1')).toEqual({ kind: 'rc', app: 'app', base: '0.193.0', build: 1 })
    expect(parseReleaseTag('rc-office-admin-2.4.1-3')).toEqual({ kind: 'rc', app: 'office-admin', base: '2.4.1', build: 3 })
    expect(parseReleaseTag('v1.2.3')).toBeNull()
  })

  it('counts up from the highest release candidate of the same version', () => {
    const stable = parseReleaseTag('stable-app-0.193.0')!
    expect(nextHotfixVersion(stable, [])).toBe('0.193.0-1')
    expect(nextHotfixVersion(stable, ['rc-app-0.193.0-1', 'rc-app-0.193.0-2', 'rc-app-0.194.0-5', 'rc-web-0.193.0-9'])).toBe('0.193.0-3')
    expect(nextHotfixVersion(parseReleaseTag('rc-app-0.193.0-4')!, ['rc-app-0.193.0-2'])).toBe('0.193.0-5')
  })

  it('rejects input that could not be run safely', () => {
    const input = { tag: 'stable-app-0.193.0', commits: ['6e82f7ab2cd42a23251f4bee939ee10f7925321f'], version: '0.193.0-1', packageDir: 'apps/frontend/app' }
    expect(validateHotfixInput(input)).toBeNull()
    expect(validateHotfixInput({ ...input, commits: [] })).toMatch(/at least one/)
    expect(validateHotfixInput({ ...input, commits: ['--exec=rm'] })).toMatch(/commit ID/)
    expect(validateHotfixInput({ ...input, version: '0.194.0-1' })).toMatch(/start with 0.193.0-/)
    expect(validateHotfixInput({ ...input, packageDir: '../outside' })).toMatch(/inside the repository/)
  })

  it('plans the same commands as the manual flow', () => {
    const plan = buildHotfixPlan({ tag: 'stable-app-0.193.0', commits: ['6e82f7ab'], version: '0.193.0-1', packageDir: 'apps/frontend/app', returnTo: 'develop' }, '/code/tradelocker', 'origin')
    expect(plan.rcTag).toBe('rc-app-0.193.0-1')
    expect(plan.steps.map(step => formatCommand(step.args))).toEqual([
      'git fetch --tags origin',
      'git checkout --detach stable-app-0.193.0',
      'git cherry-pick -x 6e82f7ab',
      'npm pkg set version=0.193.0-1 --prefix apps/frontend/app',
      'git diff',
      'git commit -am "[APP 0.193.0-1] chore: version packages"',
      'git tag rc-app-0.193.0-1',
      'git push origin rc-app-0.193.0-1',
      'git checkout develop',
    ])
    expect(buildHotfixPlan({ ...plan.input, returnTo: null }, '/code/tradelocker', 'origin').steps.at(-1)!.id).toBe('push')
  })

  it('lists only the files a cherry-pick left unmerged', () => {
    const status = ['A  .changeset/a.md', 'UU .gitlab/changeset-ci.yml', 'M  apps/frontend/app/.nvmrc', 'DU .gitlab/mr-label-bot.yml', 'UD old name.yml', ''].join('\0')
    expect(parseUnmerged(status)).toEqual([
      { path: '.gitlab/changeset-ci.yml', tagDeleted: false, commitDeleted: false },
      { path: '.gitlab/mr-label-bot.yml', tagDeleted: true, commitDeleted: false },
      { path: 'old name.yml', tagDeleted: false, commitDeleted: true },
    ])
  })
})
