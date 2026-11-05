export function cliOverlayRoot(home: string, platform: string, xdgDataHome: string | undefined) {
  if (platform === 'darwin')
    return `${home}/Library/Application Support/dev.pull-review.app/cli-overlay`
  return `${xdgDataHome || `${home}/.local/share`}/pull-review/cli-overlay`
}

export function openFolderCommand(platform: string) {
  return platform === 'darwin' ? 'open' : 'xdg-open'
}
