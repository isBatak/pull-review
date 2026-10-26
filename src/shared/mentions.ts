import type { User } from './types'

const CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g
const MENTION = /(?<![\w.@/`-])@([\w][\w.-]*[\w]|\w)/g

export function mentionedUsernames(text: string): string[] {
  const usernames = new Set<string>()
  for (const match of text.replace(CODE, ' ').matchAll(MENTION))
    usernames.add(match[1]!.toLowerCase())
  return [...usernames]
}

export function withMentionedReviewers(reviewers: User[], author: User, description: string | null, members: User[]): User[] {
  const mentioned = mentionedUsernames(description ?? '')
  if (!mentioned.length)
    return reviewers
  const byUsername = new Map(members.map(member => [member.username.toLowerCase(), member]))
  const seen = new Set([author.id, ...reviewers.map(reviewer => reviewer.id)])
  const extra = mentioned.flatMap((username) => {
    const member = byUsername.get(username)
    if (!member || seen.has(member.id))
      return []
    seen.add(member.id)
    return [member]
  })
  return [...reviewers, ...extra]
}

export function mentions(description: string | null, username: string): boolean {
  return mentionedUsernames(description ?? '').includes(username.toLowerCase())
}
