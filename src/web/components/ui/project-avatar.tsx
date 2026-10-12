import type { ProjectInfo } from '../../../shared/types'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { css } from 'styled-system/css'
import { api } from '../../lib/api'

export function ProjectAvatar({ project, size = 18 }: { project: ProjectInfo, size?: number }) {
  const query = useQuery({
    queryKey: ['project-avatar', project.ref.host, project.ref.project, project.avatarUrl],
    queryFn: () => api.projectAvatar(project.ref),
    enabled: Boolean(project.avatarUrl),
    staleTime: Infinity,
    retry: false,
  })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!query.data)
      return
    const objectUrl = URL.createObjectURL(query.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [query.data])
  if (!url)
    return null
  return <img src={url} alt="" width={size} height={size} className={css({ borderRadius: 'sm', flexShrink: 0 })} />
}
