import { createLibrary, defineComponent } from '@openuidev/lang-core'
import { z } from 'zod/v4'
import { MERGE_RISK_RULES, RISK_CATEGORIES, RISK_VERDICTS } from './merge-risk'

export const CHAT_UI_LANGUAGE = 'openui-lang'

export type ChatUiName = 'Stack' | 'Callout' | 'RiskTable' | 'FileList' | 'Checklist' | 'MergeStatus' | 'MergeRisk' | 'FollowUps'

export const calloutProps = z.object({
  tone: z.enum(['info', 'success', 'warning', 'danger']).describe('info for neutral notes, warning for things to check, danger for bugs or blockers'),
  title: z.string().describe('One short line'),
  text: z.string().optional().describe('One or two sentences of detail'),
})

export const riskTableProps = z.object({
  rows: z.array(z.object({
    area: z.string().describe('What part of the change, in a few words'),
    level: z.enum(['low', 'medium', 'high']),
    reason: z.string().describe('Why, in one sentence'),
    path: z.string().optional().describe('File path relative to the repository root'),
    line: z.number().optional().describe('Line in the new version of the file'),
  })),
})

export const fileListProps = z.object({
  title: z.string(),
  files: z.array(z.object({
    path: z.string().describe('File path relative to the repository root'),
    line: z.number().optional().describe('Line in the new version of the file'),
    note: z.string().describe('What to look at in this file, in one short sentence'),
  })),
})

export const checklistProps = z.object({
  title: z.string(),
  items: z.array(z.object({
    text: z.string(),
    done: z.boolean().describe('true when the merge request already does this'),
  })),
})

export const mergeStatusProps = z.object({})

export const mergeRiskProps = z.object({
  rows: z.array(z.object({
    category: z.enum(RISK_CATEGORIES),
    verdict: z.enum(RISK_VERDICTS).describe('alignment, verification: good | decent | poor. impact: small | medium | large. rollback: low | medium | high. errors: good | decent | poor | n/a'),
    note: z.string().describe('The verdict in a few words'),
    gaps: z.array(z.object({
      text: z.string().describe('What raises the risk, in one short sentence'),
      path: z.string().optional().describe('File path relative to the repository root'),
      line: z.number().optional().describe('Line in the new version of the file'),
    })),
  })).describe('One row for each of the five categories'),
})

export const followUpsProps = z.object({
  questions: z.array(z.string()).describe('Two or three short follow-up questions the developer is likely to ask next'),
})

export interface ChatUiOptions {
  mergeStatus: boolean
}

export function createChatUiLibrary<C>(renderers: Record<ChatUiName, C>, options: ChatUiOptions = { mergeStatus: true }) {
  const Callout = defineComponent({ name: 'Callout', description: 'A highlighted note: a finding, a warning or a bug.', props: calloutProps, component: renderers.Callout })
  const RiskTable = defineComponent({ name: 'RiskTable', description: 'Rates the risk of each part of the change. Use for questions about risk or what to review first.', props: riskTableProps, component: renderers.RiskTable })
  const FileList = defineComponent({ name: 'FileList', description: 'Files to look at, each with a note. The developer can click one to open it in the diff.', props: fileListProps, component: renderers.FileList })
  const Checklist = defineComponent({ name: 'Checklist', description: 'Things a reviewer should check, marked done when the merge request already handles them.', props: checklistProps, component: renderers.Checklist })
  const MergeStatus = defineComponent({ name: 'MergeStatus', description: 'The live merge status from GitLab: pipeline, approvals, open threads and conflicts. Use when asked whether the merge request is ready to merge. Takes no arguments.', props: mergeStatusProps, component: renderers.MergeStatus })
  const MergeRisk = defineComponent({ name: 'MergeRisk', description: 'Rates how risky it is to merge, in five categories. Pull Review computes the overall low, medium or high from the verdicts.', props: mergeRiskProps, component: renderers.MergeRisk })
  const FollowUps = defineComponent({ name: 'FollowUps', description: 'Buttons with follow-up questions. The developer clicks one to ask it. Put it last.', props: followUpsProps, component: renderers.FollowUps })
  const leaves = options.mergeStatus ? [Callout, RiskTable, FileList, Checklist, MergeStatus, MergeRisk, FollowUps] : [Callout, RiskTable, FileList, Checklist, MergeRisk, FollowUps]
  const Stack = defineComponent({
    name: 'Stack',
    description: 'The root. Shows its children from top to bottom.',
    props: z.object({ children: z.array(z.union([Callout.ref, ...leaves.slice(1).map(leaf => leaf.ref)])) }),
    component: renderers.Stack,
  })
  return createLibrary({ id: 'pull-review-chat', components: [Stack, ...leaves], root: 'Stack' })
}

const CHAT_UI_RULES = [
  'Write each openui-lang program in its own fenced block that opens with ```openui-lang and closes with ```. Each block is a complete program that starts with `root = Stack(...)`. Text outside the fence is shown as Markdown.',
  'Put a sentence or two of Markdown before the block. Never repeat the content of the block in the text.',
  'Use at most one openui-lang block per answer, and keep it small: at most 8 rows or files.',
  'Patches still go in ```diff blocks and review comments still go through the comment tool, never in openui-lang.',
  'Paths are relative to the repository root, the same as in the diff.',
  ...MERGE_RISK_RULES,
]

export const CHAT_UI_EXAMPLES = [
  [
    'root = Stack([risks, next])',
    'risks = RiskTable([{area: "Session refresh", level: "high", reason: "Retries can loop when the token is revoked", path: "src/auth/refresh.ts", line: 42}])',
    'next = FollowUps(["Which tests cover the retry?", "Show the revoke path"])',
  ].join('\n'),
  [
    'root = Stack([risk])',
    'risk = MergeRisk([{category: "alignment", verdict: "good", note: "Matches the description", gaps: []}, {category: "impact", verdict: "small", note: "Only the sidebar", gaps: []}, {category: "verification", verdict: "poor", note: "No screenshots", gaps: [{text: "UI change without before and after screenshots", path: "src/sidebar.tsx", line: 12}]}, {category: "rollback", verdict: "low", note: "Client only", gaps: []}, {category: "errors", verdict: "decent", note: "Save errors are only logged", gaps: [{text: "A failed save shows no alert", path: "src/save.ts", line: 30}]}])',
  ].join('\n'),
  [
    'root = Stack([status, note])',
    'status = MergeStatus()',
    'note = Callout("warning", "One thread is still open", "The question about the cache key needs an answer before merging.")',
  ].join('\n'),
]

function whenToUse(options: ChatUiOptions) {
  const uses = options.mergeStatus
    ? 'a risk rating, a list of files to review, a checklist, the merge status, or follow-up questions'
    : 'a risk rating, a list of files to review, a checklist, or follow-up questions'
  return `Most answers are plain Markdown. Add one openui-lang block only when structured UI is clearly better than text: ${uses}.`
}

export function buildChatUiPrompt(options: ChatUiOptions) {
  const library = createChatUiLibrary<null>({ Stack: null, Callout: null, RiskTable: null, FileList: null, Checklist: null, MergeStatus: null, MergeRisk: null, FollowUps: null }, options)
  const [fence = '', ...rest] = CHAT_UI_RULES
  return library.prompt({
    preamble: 'Pull Review can show small interactive cards inside your chat answers. They are written in openui-lang, described below.',
    additionalRules: [fence, whenToUse(options), ...rest],
    examples: options.mergeStatus ? CHAT_UI_EXAMPLES : CHAT_UI_EXAMPLES.filter(example => !example.includes('MergeStatus(')),
  })
}
