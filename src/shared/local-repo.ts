export interface LocalFolderInfo {
  path: string
  isLinkedWorktree: boolean
  branch: string | null
  dirty: boolean
  suggestedWorktreePath: string
}

export type LocalCheckoutStatus = 'ready' | 'detached' | 'dirty' | 'main-checkout'

export interface LocalCheckout {
  status: LocalCheckoutStatus
  path: string
  branch: string
  sha: string
  message: string | null
}
