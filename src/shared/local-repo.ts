export interface LocalFolderInfo {
  path: string
  isLinkedWorktree: boolean
  branch: string | null
  dirty: boolean
  suggestedWorktreePath: string
}

export type LocalCheckoutStatus = 'ready' | 'detached' | 'dirty' | 'main-checkout'

export function workspaceFolderFor(sharedPath: string, ref: { iid: number }) {
  return `${sharedPath.replace(/\/+$/, '')}-mrs/${ref.iid}`
}

export interface CreatedWorkspace {
  path: string
  checkout: LocalCheckout
  moved: boolean
  dependencies: string
}

export interface LocalCheckout {
  status: LocalCheckoutStatus
  path: string
  branch: string
  sha: string
  message: string | null
  otherPath?: string | null
}
