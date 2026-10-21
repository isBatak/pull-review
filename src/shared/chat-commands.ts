export type ChatCommandIcon = 'summary' | 'risk' | 'risky' | 'files' | 'checklist' | 'tests' | 'ready'

export interface ChatCommand {
  name: string
  title: string
  description: string
  prompt: string
  icon: ChatCommandIcon
  needsMergeStatus?: boolean
}

export const CHAT_COMMANDS: ChatCommand[] = [
  { name: 'summary', title: 'Summarize', description: 'What the merge request changes and why', prompt: 'Summarize this merge request.', icon: 'summary' },
  { name: 'risk', title: 'Merge risk', description: 'Merge risk card with a low, medium or high rating', prompt: 'What is the merge risk?', icon: 'risk' },
  { name: 'risky', title: 'Riskiest changes', description: 'Risk table of the changes to check first', prompt: 'What are the riskiest changes?', icon: 'risky' },
  { name: 'files', title: 'Review order', description: 'Files to review first, with a note on each', prompt: 'Which files should I review first, and why?', icon: 'files' },
  { name: 'checklist', title: 'Review checklist', description: 'Checklist of what a reviewer should verify', prompt: 'Give me a review checklist for this merge request.', icon: 'checklist' },
  { name: 'tests', title: 'Missing tests', description: 'Changes that are not covered by tests', prompt: 'Are any tests missing for these changes?', icon: 'tests' },
  { name: 'ready', title: 'Ready to merge?', description: 'Live merge status with what still blocks it', prompt: 'Is this ready to merge? Show the merge status.', icon: 'ready', needsMergeStatus: true },
]

export function availableCommands(options: { mergeStatus: boolean }) {
  return CHAT_COMMANDS.filter(command => !command.needsMergeStatus || options.mergeStatus)
}

export function expandCommand(text: string, options: { mergeStatus: boolean }): string | null {
  const match = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match)
    return null
  const command = availableCommands(options).find(entry => entry.name === match[1]!.toLowerCase())
  if (!command)
    return null
  const extra = match[2]?.trim()
  return extra ? `${command.prompt}\n\n${extra}` : command.prompt
}
