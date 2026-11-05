import type { LocalChange } from './self-improve'
import { sourceLocation } from './self-improve'

const PART_NOTES: Record<string, string> = {
  'app-web': 'the web page of the desktop app: index.html and assets/*.js, assets/*.css from an unminified Vite build',
  'app-backend': 'the desktop app\'s backend, run by txiki.js: main.js loads the app-*.js chunk',
  'web': 'the web page the command line tool serves: index.html and assets/*.js, assets/*.css from an unminified Vite build',
  'cli.mjs': 'the command line tool and its server, one Node.js file',
}

export function buildChangeSystemPrompt(parts: string[]) {
  const layout = parts.map(part => `  - build/${part}: ${PART_NOTES[part] ?? 'part of the shipped app'}`).join('\n')
  return `You are changing Pull Review, an app for reviewing GitLab merge requests, on the user's own computer. The user asked for this change from inside the app.

Your working folder is a copy of the app as it shipped, kept in git:
- build/ holds the files the app runs. Edit these so the user sees the change.
${layout}
- source/ holds the app's own TypeScript and React source for this version, rebuilt from the source maps. Only files that made it into the build are there, so it is not the whole repository.

Every JSX element in the build carries data-sourcery="src/…:line:column", the place in source/ that rendered it. Search build/ for that value, or for strings from the source, to find the built code.

Rules:
1. Make the change in build/ so the running app shows it, and make the same change in source/ so it can become a pull request. Keep the two in step.
2. Styles use Panda CSS. A css({ … }) call in source/ becomes atomic class names, defined in the CSS files under build/. Reuse a class that already exists. If none fits, add a rule to that CSS file by hand, named the way the others are.
3. Change only files under build/ and source/. Never edit .map files or .git.
4. Do not run a build, install packages, start the app, or commit. The app checks and reloads your change itself.
5. Keep the change as small as the request needs, and match the code around it.
6. When you are done, reply with one or two short sentences in plain words that tell the user what changed. If the request is unclear or you cannot do it, change nothing and reply with one short question instead.`
}

export function buildChangePrompt(change: LocalChange, screenshotPath: string | null) {
  const { page, viewport, theme, element } = change.context
  const lines = [`Request: ${change.request}`, '']
  const where = [
    page && `- Page: ${page.title} (route ${page.route || '/'})`,
    viewport && `- Window: ${viewport.width} × ${viewport.height} px`,
    theme && `- Theme: ${theme}`,
  ].filter(Boolean)
  if (where.length)
    lines.push('Where the user was:', ...where as string[], '')
  if (element) {
    const location = sourceLocation(element.source)
    lines.push('The user pointed at this element:')
    if (location)
      lines.push(`- Rendered by source/${location.file}, line ${location.line} (data-sourcery="${element.source}")`)
    lines.push(
      `- Label: ${element.label}`,
      `- CSS path: ${element.selector}`,
      `- Size: ${element.rect.width} × ${element.rect.height} px at ${element.rect.x}, ${element.rect.y}`,
    )
    if (element.text)
      lines.push(`- Text: ${element.text}`)
    const styles = Object.entries(element.styles).filter(([, value]) => value).map(([name, value]) => `${name}: ${value}`)
    if (styles.length)
      lines.push(`- Computed styles: ${styles.join('; ')}`)
    lines.push('- HTML:', '```html', element.html, '```', '')
  }
  if (screenshotPath)
    lines.push(`A picture of the window when the user asked is at ${screenshotPath}. Open it with Read to see what they saw.`)
  return lines.join('\n').trimEnd()
}

export function buildFollowUpPrompt(reply: string) {
  return `The user replied about this request:

${reply}

Other requests may have changed the folder since your last turn, so look at the files again before you edit. The same rules apply.`
}

export interface ReplayPromptInput {
  fromVersion: string
  toVersion: string
  patchPath: string | null
  sourceApplied: boolean
}

export function buildReplayPrompt(change: LocalChange, screenshotPath: string | null, replay: ReplayPromptInput) {
  const steps = !replay.patchPath
    ? 'Its old diff is not available, so make the change again from the request.'
    : replay.sourceApplied
      ? `Its source diff from ${replay.fromVersion} is at ${replay.patchPath}, and it has already been applied to source/ here. Make the matching change in build/ so the running app shows it.`
      : `Its source diff from ${replay.fromVersion} is at ${replay.patchPath}, but it did not apply to this version's source. Make the change in both source/ and build/, following that diff where it still fits.`
  return `The user made this change on version ${replay.fromVersion}. The app has since updated to ${replay.toVersion}, so bring the change over. ${steps}
If ${replay.toVersion} already does what the request asks, change nothing and say so in one sentence.

${buildChangePrompt(change, screenshotPath)}`
}
