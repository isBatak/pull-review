import { createContext, use } from 'react'

export type RevealFile = (path: string, line: number | null) => boolean

export const FileRevealContext = createContext<RevealFile | null>(null)

export function useRevealFile() {
  return use(FileRevealContext)
}
