import type { User } from '../../shared/types'
import type { SuggestionSource } from './query-suggest'
import { describe, expect, it } from 'vitest'
import { applySuggestion, suggest } from './query-suggest'

function user(username: string, name: string): User {
  return { id: username.length, username, name, avatarUrl: null, webUrl: '' }
}

const source: SuggestionSource = {
  viewer: user('ivica.batinic', 'Ivica Batinic'),
  members: [user('ana', 'Ana Horvat'), user('ivica.batinic', 'Ivica Batinic'), user('bo', 'Bo Kovac')],
  apps: ['WEB', 'APP', 'OFFICE'],
  labels: ['Frontend', 'needs review'],
  targets: ['develop', 'main'],
}

function labels(input: string, cursor = input.length) {
  return suggest(input, cursor, source)?.items.map(item => item.label)
}

describe('suggest', () => {
  it('suggests qualifiers for the word at the cursor', () => {
    expect(labels('a')).toEqual(['author:', 'approved-by:', 'app:'])
    expect(labels('alerts -ap')).toEqual(['-approved-by:', '-app:'])
    expect(labels('alerts ')).toBeUndefined()
    expect(labels('zzz')).toBeUndefined()
  })

  it('suggests people with @me first', () => {
    expect(labels('-approved-by:')).toEqual(['@me', 'ana', 'ivica.batinic', 'bo'])
    expect(labels('author:iv')).toEqual(['ivica.batinic'])
    expect(labels('author:@')).toEqual(['@me', 'ana', 'ivica.batinic', 'bo'])
    expect(labels('author:@me')).toEqual(['@me'])
    expect(labels('author:horvat')).toEqual(['ana'])
  })

  it('suggests states, apps, labels and targets', () => {
    expect(labels('is:')).toEqual(['draft', 'approved', 'ready', 'attention', 'review'])
    expect(labels('is:re')).toEqual(['ready', 'review'])
    expect(labels('app:o')).toEqual(['office'])
    expect(labels('label:need')).toEqual(['"needs review"'])
    expect(labels('target:d')).toEqual(['develop'])
  })

  it('only completes the value after the last comma', () => {
    const list = suggest('author:ana,b', 12, source)!
    expect(list.from).toBe(11)
    expect(list.items.map(item => item.label)).toEqual(['ivica.batinic', 'bo'])
  })
})

describe('applySuggestion', () => {
  it('keeps typing after a qualifier and adds a space after a value', () => {
    const qualifier = suggest('fix -appr', 9, source)!
    expect(applySuggestion('fix -appr', qualifier, qualifier.items[0]!)).toEqual({ value: 'fix -approved-by:', cursor: 17 })

    const value = suggest('-approved-by:@ alerts', 14, source)!
    expect(applySuggestion('-approved-by:@ alerts', value, value.items[0]!)).toEqual({ value: '-approved-by:@me alerts', cursor: 16 })

    const atEnd = suggest('author:an', 9, source)!
    expect(applySuggestion('author:an', atEnd, atEnd.items[0]!)).toEqual({ value: 'author:ana ', cursor: 11 })
  })
})
