import { describe, expect, it } from 'vitest'
import { parseEnvOutput } from './env-output'

describe('parseEnvOutput', () => {
  it('splits NUL separated entries and keeps values containing equals signs', () => {
    expect(parseEnvOutput('PATH=/a:/b\0GITLAB_TOKEN=abc=def\0\0BROKEN\0')).toEqual({
      PATH: '/a:/b',
      GITLAB_TOKEN: 'abc=def',
    })
  })
})
