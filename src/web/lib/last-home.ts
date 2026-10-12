const KEY = 'pull-review:last-home'

export function rememberHomeSearch(search: string) {
  try {
    sessionStorage.setItem(KEY, search)
  }
  catch {}
}

export function homePath() {
  try {
    return `/${sessionStorage.getItem(KEY) ?? ''}`
  }
  catch {
    return '/'
  }
}
