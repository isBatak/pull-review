import type { DiffFile, MergeRequest, User } from '../../shared/types'
import { createContext, use } from 'react'
import { useDiscussionActions } from '../hooks/use-merge-request'

export interface ReviewContextValue {
  mergeRequest: MergeRequest
  files: DiffFile[]
  viewer: User
  projectUrl: string
}

export const ReviewContext = createContext<ReviewContextValue | null>(null)

export function useReview() {
  const value = use(ReviewContext)
  if (!value)
    throw new Error('useReview must be used inside ReviewContext')
  return value
}

export function useReviewActions() {
  const { mergeRequest } = useReview()
  return useDiscussionActions(mergeRequest.ref, mergeRequest.diffRefs)
}
