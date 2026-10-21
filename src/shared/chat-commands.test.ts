import { describe, expect, it } from 'vitest'
import { availableCommands, CHAT_COMMANDS, expandCommand } from './chat-commands'

const on = { mergeStatus: true }
const off = { mergeStatus: false }

describe('expandCommand', () => {
  it('turns a command into its prompt', () => {
    expect(expandCommand('/risk', on)).toBe('What is the merge risk?')
    expect(expandCommand('  /RISK  ', on)).toBe('What is the merge risk?')
  })

  it('adds the words after the command to the prompt', () => {
    expect(expandCommand('/risk focus on the auth changes', on)).toBe('What is the merge risk?\n\nfocus on the auth changes')
  })

  it('leaves normal text and unknown commands alone', () => {
    expect(expandCommand('what is /risk?', on)).toBeNull()
    expect(expandCommand('/nope', on)).toBeNull()
    expect(expandCommand('/clear', on)).toBeNull()
  })

  it('only knows /ready while the merge status is on', () => {
    expect(expandCommand('/ready', on)).toContain('ready to merge')
    expect(expandCommand('/ready', off)).toBeNull()
  })
})

describe('availableCommands', () => {
  it('hides commands that need the merge status', () => {
    expect(availableCommands(on)).toHaveLength(CHAT_COMMANDS.length)
    expect(availableCommands(off).map(command => command.name)).not.toContain('ready')
  })

  it('has unique names', () => {
    expect(new Set(CHAT_COMMANDS.map(command => command.name)).size).toBe(CHAT_COMMANDS.length)
  })
})
