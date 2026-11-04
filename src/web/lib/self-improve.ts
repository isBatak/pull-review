import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { OPEN_STATUSES } from '../../shared/self-improve'
import { api } from './api'

const STATE_KEY = ['self-improve-state']
const POLL_MS = 2000

export function useSelfImproveState() {
  return useQuery({
    queryKey: STATE_KEY,
    queryFn: api.selfImproveState,
    retry: false,
    refetchInterval: query => query.state.data?.changes.some(change => OPEN_STATUSES.includes(change.status)) ? POLL_MS : false,
  })
}

export function useRefreshSelfImprove() {
  const queryClient = useQueryClient()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: STATE_KEY }), [queryClient])
}
