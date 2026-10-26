import type { User } from './types'
import { describe, expect, it } from 'vitest'
import { mentionedUsernames, mentions, withMentionedReviewers } from './mentions'

function user(id: number, username: string): User {
  return { id, username, name: username, avatarUrl: null, webUrl: '' }
}

describe('mentionedUsernames', () => {
  it('finds usernames tagged in the text', () => {
    expect(mentionedUsernames('Reviewers: @ana, @Bo and @luka_k.\n\n@ivica.batinic please check')).toEqual(['ana', 'bo', 'luka_k', 'ivica.batinic'])
  })

  it('keeps dots, dashes and underscores inside a username', () => {
    expect(mentionedUsernames('cc @ivica.batinic @team-web @a_b')).toEqual(['ivica.batinic', 'team-web', 'a_b'])
  })

  it('skips emails, paths and code', () => {
    expect(mentionedUsernames('mail ana@tradelocker.com, import @tradelocker/ds, `@inline` and\n```\n@block\n```')).toEqual(['tradelocker'])
  })

  it('returns each username once', () => {
    expect(mentionedUsernames('@ana @ana @ANA')).toEqual(['ana'])
  })
})

describe('withMentionedReviewers', () => {
  const ana = user(1, 'ana')
  const bo = user(2, 'bo')
  const ivica = user(3, 'ivica.batinic')
  const members = [ana, bo, ivica]

  it('adds tagged members after the assigned reviewers', () => {
    expect(withMentionedReviewers([bo], ana, 'Also @ivica.batinic and @bo', members)).toEqual([bo, ivica])
  })

  it('leaves out the author and unknown usernames', () => {
    expect(withMentionedReviewers([], ana, '@ana @nobody @ivica.batinic', members)).toEqual([ivica])
  })

  it('keeps reviewers when there is no description', () => {
    expect(withMentionedReviewers([bo], ana, null, members)).toEqual([bo])
  })
})

describe('mentions', () => {
  it('matches the whole username only', () => {
    expect(mentions('cc @ivica.batinic', 'ivica.batinic')).toBe(true)
    expect(mentions('cc @ivica.batinic', 'ivica')).toBe(false)
  })
})
