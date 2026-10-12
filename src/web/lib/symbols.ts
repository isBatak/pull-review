import type { SymbolResult } from '../../shared/symbols'
import type { DiffFile, MrRef } from '../../shared/types'
import { useQuery } from '@tanstack/react-query'
import { createContext, use } from 'react'
import { buildSymbolResult, searchDiffFiles } from '../../shared/symbols'
import { mrKey } from '../../shared/mr-ref'
import { api } from './api'

export interface SymbolRequest {
  name: string
  path: string
  anchor: DOMRect
}

export const SymbolContext = createContext<((request: SymbolRequest) => void) | null>(null)

export function useOpenSymbol() {
  return use(SymbolContext)
}

export interface SymbolSearch {
  result: SymbolResult
  repositoryError: string | null
}

export function useSymbolSearch(input: { mrRef: MrRef, name: string, sha: string, files: DiffFile[], repoPath: string | null }) {
  const { mrRef, name, sha, files, repoPath } = input
  return useQuery({
    queryKey: ['symbols', mrKey(mrRef), sha, name, repoPath],
    staleTime: Infinity,
    queryFn: async (): Promise<SymbolSearch> => {
      const changed = new Set(files.map(file => file.path))
      if (repoPath) {
        try {
          const found = await api.symbols(mrRef, { name, sha, repoPath })
          return { result: buildSymbolResult(name, 'repository', found, changed), repositoryError: null }
        }
        catch (error) {
          return {
            result: buildSymbolResult(name, 'diff', searchDiffFiles(files, name), changed),
            repositoryError: error instanceof Error ? error.message : String(error),
          }
        }
      }
      return { result: buildSymbolResult(name, 'diff', searchDiffFiles(files, name), changed), repositoryError: null }
    },
  })
}
