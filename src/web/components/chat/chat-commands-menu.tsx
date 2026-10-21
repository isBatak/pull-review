import type { ChatCommandIcon } from '../../../shared/chat-commands'
import { Menu } from '@ark-ui/react/menu'
import { Portal } from '@ark-ui/react/portal'
import { FileStack, FlaskConical, GitMerge, ListChecks, RotateCcw, ScrollText, ShieldAlert, SquareSlash, TriangleAlert } from 'lucide-react'
import { css } from 'styled-system/css'
import { availableCommands } from '../../../shared/chat-commands'
import { WithTooltip } from '../ui/button'

const ICONS: Record<ChatCommandIcon, typeof ScrollText> = {
  summary: ScrollText,
  risk: ShieldAlert,
  risky: TriangleAlert,
  files: FileStack,
  checklist: ListChecks,
  tests: FlaskConical,
  ready: GitMerge,
}

const NEW_CONVERSATION = '__clear__'

const trigger = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  w: '6',
  h: '6',
  color: 'fg.default',
  bg: 'bg.muted',
  borderRadius: 'md',
  cursor: 'pointer',
  outline: 'none',
  '& svg': { w: '3.5', h: '3.5' },
  _hover: { _enabled: { bg: 'bg.emphasized' } },
  _open: { bg: 'bg.emphasized', color: 'accent.fg' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  _focusVisible: { boxShadow: '0 0 0 2px var(--colors-accent-default)' },
})

const item = css({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  columnGap: '2.5',
  alignItems: 'center',
  px: '2',
  py: '1.5',
  borderRadius: 'md',
  cursor: 'pointer',
  outline: 'none',
  _highlighted: { bg: 'bg.muted' },
  '& > svg': { gridRow: 'span 2', w: '4', h: '4', color: 'fg.subtle' },
})

interface ChatCommandsMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mergeStatus: boolean
  disabled: boolean
  onSend: (prompt: string) => void
  onNewConversation: () => void
}

export function ChatCommandsMenu({ open, onOpenChange, mergeStatus, disabled, onSend, onNewConversation }: ChatCommandsMenuProps) {
  const commands = availableCommands({ mergeStatus })
  return (
    <Menu.Root
      open={open}
      onOpenChange={details => onOpenChange(details.open)}
      positioning={{ placement: 'top-start' }}
      onSelect={(details) => {
        if (details.value === NEW_CONVERSATION)
          onNewConversation()
        else
          onSend(commands.find(command => command.name === details.value)!.prompt)
      }}
    >
      <WithTooltip label="Common prompts" shortcut="/">
        <span className={css({ display: 'inline-flex' })}>
          <Menu.Trigger className={trigger} disabled={disabled} aria-label="Common prompts" aria-keyshortcuts="/">
            <SquareSlash />
          </Menu.Trigger>
        </span>
      </WithTooltip>
      <Portal>
        <Menu.Positioner className={css({ zIndex: 'popover' })}>
          <Menu.Content className={css({ w: '22rem', maxW: 'calc(100vw - 32px)', maxH: 'min(30rem, var(--available-height))', overflowY: 'auto', p: '1', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', boxShadow: 'popover', outline: 'none' })}>
            {commands.map((command) => {
              const Icon = ICONS[command.icon]
              return (
                <Menu.Item key={command.name} value={command.name} className={item}>
                  <Icon />
                  <span className={css({ display: 'flex', alignItems: 'baseline', gap: '2', fontSize: 'sm' })}>
                    {command.title}
                    <span className={css({ fontFamily: 'mono', fontSize: 'xs', color: 'fg.subtle' })}>{`/${command.name}`}</span>
                  </span>
                  <span className={css({ fontSize: 'xs', color: 'fg.muted', truncate: true })}>{command.description}</span>
                </Menu.Item>
              )
            })}
            <Menu.Separator className={css({ my: '1', borderTopWidth: '1px', borderColor: 'border.subtle' })} />
            <Menu.Item value={NEW_CONVERSATION} className={item}>
              <RotateCcw />
              <span className={css({ display: 'flex', alignItems: 'baseline', gap: '2', fontSize: 'sm' })}>
                New conversation
                <span className={css({ fontFamily: 'mono', fontSize: 'xs', color: 'fg.subtle' })}>/clear</span>
              </span>
              <span className={css({ fontSize: 'xs', color: 'fg.muted' })}>Start over with an empty chat</span>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
